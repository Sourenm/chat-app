import httpx
from typing import Dict, Any, List
from .retriever import retrieve

RAG_PROMPT = """You are a helpful assistant. Answer the user using ONLY the provided context.
If the answer is not in the context, say you don't know.
Cite sources inline as [filename p.X] when possible.

Question: {question}

Context:
{context}

Answer:"""

def build_context(chunks: List[Dict], max_chars=3500):
    ctx, used = "", []
    for c in chunks:
        page = c["metadata"].get("page")
        src  = c["metadata"].get("source", "source")
        prefix = f"[{src}{' p.'+page if page else ''}] "
        piece = f"{prefix}{c['text']}\n"
        if len(ctx) + len(piece) > max_chars: break
        ctx += piece
        used.append({
            "doc_id": c["doc_id"],
            "source": src,
            "page": page,
            "score": c["score"],
            "snippet": c["text"][:500]
        })
    return ctx, used

async def call_llama_worker(prompt: str, port: int = 21002, temperature=0.2, top_p=0.95, max_new_tokens=400):
    # Calls your existing /worker_generate on the LLaMA worker
    payload = {
        "prompt": prompt,
        "temperature": temperature,
        "top_p": top_p,
        "max_new_tokens": max_new_tokens
    }
    url = f"http://127.0.0.1:{port}/worker_generate"
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(url, json=payload)
        r.raise_for_status()
        data = r.json()
        # Expect { "text": "..." } per your worker; adjust if needed
        return data.get("text") or data.get("output") or str(data)

async def answer_with_rag(query: str, index_name="default", top_k=5):
    hits = retrieve(index_name, query, top_k=top_k)
    ctx, used = build_context(hits)
    prompt = RAG_PROMPT.format(question=query, context=ctx if ctx.strip() else "No context.")
    reply = await call_llama_worker(prompt)
    return {"answer": reply, "sources": used}
