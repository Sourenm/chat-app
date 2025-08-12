from __future__ import annotations
from typing import List, Optional, TypedDict
import os
import base64
import uuid
import asyncio
import tempfile
import re
from typing import Iterable

import httpx
from langgraph.graph import StateGraph, END

# RAG internals (same modules used by rag_router.py)
from rag.loaders import load_any
from rag.chunker import chunk_doc
from rag.embeddings import embed_texts
from rag.store_faiss import FaissStore
from rag.pipeline import answer_with_rag

# Your local helpers
from diffusion_worker import generate_image
from tts_wrapper import generate_audio

LLAMA_WORKER_URL = "http://localhost:21002/worker_generate"
QWEN_WORKER_URL  = "http://localhost:21003/worker_generate"
BASE_MODEL_NAME  = "meta-llama/Llama-3.2-1B-Instruct"
_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?|[^\sA-Za-z0-9]")

# ---------- LangGraph State ----------

class StoryState(TypedDict, total=False):
    # Inputs
    narrative: str                          # high-level instruction for style/tone/POV
    image: Optional[str]                    # base64 data URL or http(s) URL
    rag_docs: List[str]                     # local file paths to index (optional)
    rag_index_name: Optional[str]           # name for FAISS index (optional)
    build_index: bool                       # force building index from rag_docs
    finetune: bool                          # whether to run LoRA fine-tuning
    finetune_dataset: Optional[str]         # path to dataset (json or jsonl)
    adapter_name: Optional[str]             # adapters/<adapter_name> will be produced/used
    num_epochs: int
    learning_rate: float
    lora_r: int
    lora_alpha: int
    lora_dropout: float

    # Orchestration options
    num_illustrations: int                  # 1..N
    illustration_prompt_hint: Optional[str] # optional style hint for SDXL

    # Intermediates / Outputs
    scene_summary: str
    kb_snippet: str
    story_text: str
    illustrations: List[str]                # data:image/png;base64,...
    audio_wav_b64: str                      # data:audio/wav;base64,...

# ---------- Helpers ----------

def _approx_clip_tokens(text: str) -> list[str]:
    text = (text or "").strip()
    text = re.sub(r"\s+", " ", text)
    return _TOKEN_PATTERN.findall(text)

def _truncate_to_token_budget(text: str, max_tokens: int) -> str:
    toks = _approx_clip_tokens(text)
    if len(toks) <= max_tokens:
        return text.strip()
    toks = toks[:max_tokens]
    out = []
    for i, t in enumerate(toks):
        if i > 0 and t.isalnum() and out[-1].isalnum():
            out.append(" ")
        out.append(t)
    return "".join(out).strip()

def _final_token_clamp_by_chunks(text: str, max_tokens: int) -> str:
    """
    Last line of defense: if text still exceeds token budget, we drop
    trailing comma-separated chunks until it's within budget.
    """
    pieces = [p.strip() for p in text.split(",") if p.strip()]
    if not pieces:
        return _truncate_to_token_budget(text, max_tokens)

    cur = ", ".join(pieces)
    while len(_approx_clip_tokens(cur)) > max_tokens and len(pieces) > 1:
        pieces.pop()  # drop last chunk
        cur = ", ".join(pieces)
    if len(_approx_clip_tokens(cur)) > max_tokens:
        # still too long; do a hard truncate
        cur = _truncate_to_token_budget(cur, max_tokens)
    return cur.strip()

async def _compress_to_keywords(state, source_text: str, n_terms: int = 16) -> str:
    if not source_text.strip():
        return ""
    prompt = (
        "Extract concise, evocative keywords or short phrases from the text. "
        f"Return {n_terms} items, comma-separated, no numbering, no extra words.\n\n"
        f"{source_text.strip()}\n"
    )
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(LLAMA_WORKER_URL, json={
            "prompt": prompt,
            "temperature": 0.1,
            "top_p": 0.9,
            "max_new_tokens": 120,
        })
        resp.raise_for_status()
        data = resp.json()
        kw = (data.get("text") or "").strip()
        # normalize commas/spaces
        kw = re.sub(r"\s*,\s*", ", ", kw)
        kw = re.sub(r"\s+", " ", kw)
        # preliminary cap (tighter than final): aim small to avoid surprises
        kw = _truncate_to_token_budget(kw, max_tokens=60)
        return kw


async def _run_finetune_if_needed(state: StoryState) -> dict:
    if not state.get("finetune"):
        return {}

    adapter_name = state.get("adapter_name") or f"story_{uuid.uuid4().hex[:8]}"
    output_dir = os.path.join("adapters", adapter_name)
    os.makedirs("adapters", exist_ok=True)

    # If adapter already exists, skip
    if os.path.isdir(output_dir) and os.listdir(output_dir):
        return {"adapter_name": adapter_name}

    # Build command to call your existing script
    cmd = [
        "python", "finetune_llama.py",
        "--base_model", BASE_MODEL_NAME,
        "--train_file", state["finetune_dataset"],
        "--output_dir", output_dir,
        "--num_epochs", str(state.get("num_epochs", 3)),
        "--learning_rate", str(state.get("learning_rate", 2e-4)),
        "--lora_r", str(state.get("lora_r", 8)),
        "--lora_alpha", str(state.get("lora_alpha", 16)),
        "--lora_dropout", str(state.get("lora_dropout", 0.05)),
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"Fine-tune failed: {stderr.decode('utf-8', 'ignore')}")
    return {"adapter_name": adapter_name}

async def _build_index_if_needed(state: StoryState) -> dict:
    """
    If rag_docs provided (and build_index True, or index doesn't exist),
    build/refresh a FAISS index using your rag modules.
    """
    docs = state.get("rag_docs") or []
    index_name = state.get("rag_index_name") or "default"

    if not docs:
        return {"rag_index_name": None}

    store_path = os.path.join("indices", f"{index_name}.faiss")
    need_build = state.get("build_index", False) or (not os.path.exists(store_path))

    if not need_build:
        return {"rag_index_name": index_name}

    all_chunks = []
    for p in docs:
        for doc in load_any(p):
            chunks = chunk_doc(doc, chunk_tokens=850, overlap=120)
            all_chunks.extend(chunks)

    texts = [c.text for c in all_chunks]
    if not texts:
        return {"rag_index_name": None}

    vecs = embed_texts(texts)
    store = FaissStore(name=index_name)
    store.load(dim=vecs.shape[1])
    ids = [f"chunk-{i}" for i in range(len(texts))]
    store.add(vecs, ids, metas=[{"source": "story_kb"} for _ in texts])
    store.save()
    return {"rag_index_name": index_name}

async def _describe_image_with_qwen(state: StoryState) -> dict:
    image = state.get("image")
    if not image:
        return {"scene_summary": ""}

    prompt = (
        "You are a visual analyst. Describe this image in 6–10 sentences. "
        "Capture scene, setting, characters/objects, emotions, lighting, and style tags. "
        "End with a short bullet list of evocative visual motifs."
    )

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(QWEN_WORKER_URL, json={
            "prompt": prompt,
            "image": image,
            "temperature": 0.2,
            "top_p": 0.9,
            "max_new_tokens": 320,
        })
        resp.raise_for_status()
        data = resp.json()
        return {"scene_summary": data.get("text", "").strip()}

async def _retrieve_kb_snippet(state: StoryState) -> dict:
    """
    Optional: pull a small factual/context snippet to enrich the story.
    Uses your RAG pipeline if an index exists.
    """
    index_name = state.get("rag_index_name")
    if not index_name:
        return {"kb_snippet": ""}

    query = (
        "Extract 5–7 concrete facts, terms, or setting details relevant to the following scene:\n\n"
        f"{state.get('scene_summary','')}\n\n"
        "Return a compact paragraph with crisp details, no list formatting."
    )

    try:
        answer = answer_with_rag(index_name, query)
    except Exception:
        answer = ""
    return {"kb_snippet": (answer or "").strip()}

async def _write_story_with_llama(state: StoryState) -> dict:
    # Build a single, clean prompt
    parts = [
        "Write a short, vivid story (200–350 words).",
        "Use present tense, strong sensory detail, and a coherent arc.",
        "Keep it tasteful; avoid gore or disallowed content.",
    ]
    if state.get("narrative"):
        parts.append(f"Authoring guidance:\n{state['narrative']}")
    if state.get("scene_summary"):
        parts.append(f"Image scene summary:\n{state['scene_summary']}")
    if state.get("kb_snippet"):
        parts.append(f"Context to weave in subtly:\n{state['kb_snippet']}")

    prompt = "\n\n".join(parts) + "\n\nEND."

    payload = {
        "prompt": prompt,
        "temperature": 0.7,
        "top_p": 0.95,
        "max_new_tokens": 600,
    }
    if state.get("adapter_name"):
        payload["adapter_name"] = state["adapter_name"]

    async with httpx.AsyncClient(timeout=180) as client:
        resp = await client.post(LLAMA_WORKER_URL, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return {"story_text": data.get("text", "").strip()}

# --- generate illustrations (replace your whole _generate_illustrations) ---
async def _generate_illustrations(state: StoryState) -> dict:
    n = max(1, int(state.get("num_illustrations", 1)))
    hint = (state.get("illustration_prompt_hint") or "cinematic, cohesive color palette, soft light").strip()

    scene = state.get("scene_summary", "") or ""
    story = state.get("story_text", "") or ""

    # keywords are SHORT and high-signal
    scene_kw = await _compress_to_keywords(state, scene, n_terms=14) if scene else ""
    story_kw = await _compress_to_keywords(state, story, n_terms=14) if (n > 1 and story) else ""

    # Build prompts WITHOUT filler words; keep to "keywords, style"
    prompts = []
    if scene_kw:
        prompts.append(f"{scene_kw}, {hint}".strip(", "))
    elif scene:
        prompts.append(f"{scene}, {hint}".strip(", "))

    if n > 1:
        if story_kw:
            prompts.append(f"{story_kw}, {hint}".strip(", "))
        elif story:
            prompts.append(f"{story}, {hint}".strip(", "))

    images: list[str] = []
    for p in prompts[:n]:
        # hard pre-trim by chars to defang weird cases
        if len(p) > 500:
            p = p[:500].rstrip()

        # FINAL CLAMP: ensure we’re safely under CLIP’s 77 (use 74 for cushion)
        p = _final_token_clamp_by_chunks(p, max_tokens=74)

        # (optional) debug: print estimated token count you’re sending
        # print("ILLUSTRATION TOKENS =", len(_approx_clip_tokens(p)), "|", p)

        img_data_url = await generate_image(p, None)
        images.append(img_data_url)

    return {"illustrations": images}

async def _narrate_with_tts(state: StoryState) -> dict:
    text = state.get("story_text", "").strip()
    if not text:
        return {"audio_wav_b64": ""}

    tmp_path = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4().hex}.wav")
    # generate_audio is sync; run it off-thread
    await asyncio.to_thread(generate_audio, text, tmp_path)

    with open(tmp_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")
    try:
        os.remove(tmp_path)
    except Exception:
        pass
    return {"audio_wav_b64": f"data:audio/wav;base64,{b64}"}

# ---------- Graph definition ----------

graph = StateGraph(StoryState)

graph.add_node("maybe_finetune", _run_finetune_if_needed)
graph.add_node("maybe_index", _build_index_if_needed)
graph.add_node("vision_describe", _describe_image_with_qwen)
graph.add_node("kb_retrieve", _retrieve_kb_snippet)
graph.add_node("write_story", _write_story_with_llama)
graph.add_node("illustrate", _generate_illustrations)
graph.add_node("narrate", _narrate_with_tts)

# Linear path (nodes themselves handle "do nothing" if input not provided)
graph.set_entry_point("maybe_finetune")
graph.add_edge("maybe_finetune", "maybe_index")
graph.add_edge("maybe_index", "vision_describe")
graph.add_edge("vision_describe", "kb_retrieve")
graph.add_edge("kb_retrieve", "write_story")
graph.add_edge("write_story", "illustrate")
graph.add_edge("illustrate", "narrate")
graph.add_edge("narrate", END)

# Compiled app (use .invoke / .ainvoke)
app = graph.compile()
