import httpx
from fastapi import Request
from fastapi.responses import JSONResponse
import traceback
import re

from dynamic_registry import get as get_dynamic_port  # ← NEW

# Port mapping for each supported static model
MODEL_PORTS = {
    "meta-llama/Llama-3.2-1B-Instruct": 21002,
    "mlx-community/Qwen2-VL-2B-Instruct-4bit": 21003,
}

def _clean_dynamic_output(s: str) -> str:
    if not s:
        return s
    # Strip a leading assistant label if present
    for lead in ("### Assistant:", "Assistant:", "assistant:", "ASSISTANT:"):
        s = s.lstrip()
        if s.startswith(lead):
            s = s[len(lead):].lstrip()
            break

    # Hard cut at start of a new turn marker
    cut_markers = [
        "\n### User:", "\n### System:", "\n### Assistant:",
        "\nUser:", "\nSystem:", "\nAssistant:"
    ]
    cut_idx = min([s.find(m) for m in cut_markers if m in s] or [-1])
    if cut_idx != -1:
        s = s[:cut_idx]

    # De-duplicate consecutive sentences
    # Normalize whitespace, then split into sentences
    norm = re.sub(r"\s+", " ", s).strip()
    parts = re.split(r"(?<=[\.!\?])\s+", norm)
    out = []
    last = None
    repeats = 0
    for p in parts:
        if last is not None and p.lower() == last.lower():
            repeats += 1
            if repeats >= 1:  # allow at most one immediate repeat
                break
        else:
            repeats = 0
        out.append(p)
        last = p

    # Also guard against small-loop patterns: repeated 20+ char tail
    cleaned = " ".join(out).strip()
    tail = cleaned[-40:]
    if tail and cleaned[:-40].find(tail) != -1:
        cleaned = cleaned[: cleaned[:-40].find(tail) + len(tail)]
    return cleaned.strip()

async def chat_completion(request: Request):
    try:
        payload = await request.json()
        model_name = payload.get("model", "meta-llama/Llama-3.2-1B-Instruct")
        messages = payload.get("messages", [])
        temperature = payload.get("temperature", 0.7)
        top_p = payload.get("top_p", 0.95)
        frequency_penalty = payload.get("frequency_penalty", 0.0)
        stop = payload.get("stop", []) or []

        # ---------- Resolve target worker port ----------
        port = MODEL_PORTS.get(model_name)
        if port is None:
            dyn = get_dynamic_port(model_name)  # dynamic MLX worker?
            if dyn is not None:
                port = dyn["port"]

        if port is None:
            return JSONResponse(status_code=404, content={
                "error": f"Model '{model_name}' is not loaded. Load it first via POST /mlx/load."
            })

        # ---------- Helpers ----------
        def _content_to_text(content):
            # content may be str or [{"type":"text","text":...}, {"type":"image_url",...}]
            if isinstance(content, list):
                return "".join([c.get("text", "") for c in content if c.get("type") == "text"])
            return str(content or "")

        def build_llama3_prompt(msgs):
            """Llama 3.x chat template:
            <|begin_of_text|><|start_header_id|>system<|end_header_id|>

            ...<|eot_id|><|start_header_id|>user<|end_header_id|>

            ...<|eot_id|><|start_header_id|>assistant<|end_header_id|>

            """
            sys_msg = next((m for m in msgs if m.get("role") == "system"), None)
            sys_txt = _content_to_text(sys_msg["content"]) if sys_msg else "You are a helpful assistant."

            # collect all user/assistant turns except trailing assistant
            turns = []
            for m in msgs:
                role = m.get("role")
                if role == "user":
                    turns.append(("user", _content_to_text(m.get("content"))))
                elif role == "assistant":
                    turns.append(("assistant", _content_to_text(m.get("content"))))

            # build template
            parts = []
            parts.append("<|begin_of_text|>")
            parts.append("<|start_header_id|>system<|end_header_id|>\n\n" + sys_txt + "<|eot_id|>")

            for role, text in turns:
                if role == "user":
                    parts.append("<|start_header_id|>user<|end_header_id|>\n\n" + text + "<|eot_id|>")
                elif role == "assistant":
                    parts.append("<|start_header_id|>assistant<|end_header_id|>\n\n" + text + "<|eot_id|>")

            # request next assistant turn
            parts.append("<|start_header_id|>assistant<|end_header_id|>\n\n")
            return "".join(parts)

        def build_dynamic_plaintext_prompt(msgs):
            # Neutral "###" chat style
            def _content_to_text(c):
                if isinstance(c, list):
                    return "".join([x.get("text", "") for x in c if x.get("type") == "text"])
                return str(c or "")

            parts = []
            sys_msg = next((m for m in msgs if m.get("role") == "system"), None)
            if sys_msg:
                parts.append("### System:\n" + _content_to_text(sys_msg.get("content")))
            for m in msgs:
                role = m.get("role")
                if role == "user":
                    parts.append("### User:\n" + _content_to_text(m.get("content")))
                elif role == "assistant":
                    parts.append("### Assistant:\n" + _content_to_text(m.get("content")))
            parts.append("### Assistant:\n")
            return "\n".join(parts)


        # ---------- Build worker payload per model ----------
        worker_payload = {
            "temperature": float(temperature) if temperature is not None else 0.7,
            "top_p": float(top_p) if top_p is not None else 0.95,
            "frequency_penalty": float(frequency_penalty) if frequency_penalty is not None else 0.0,
            "stop": stop or [],
            "max_new_tokens": int(payload.get("max_tokens", 512)),
        }            

        if model_name == "meta-llama/Llama-3.2-1B-Instruct":
            worker_payload["adapter_name"] = payload.get("adapter")
            print(f"Using adapter: {worker_payload['adapter_name']}")
            # Use official Llama 3.x chat template, and stop at end-of-turn
            prompt = build_llama3_prompt(messages)
            # Ensure we stop generation when the model emits end-of-turn
            if "<|eot_id|>" not in stop:
                stop = list(stop) + ["<|eot_id|>"]
            worker_payload["prompt"] = prompt

        elif model_name == "mlx-community/Qwen2-VL-2B-Instruct-4bit":
            # Keep your existing Qwen-VL behavior (multimodal)
            prompt = build_dynamic_plaintext_prompt(messages)
            worker_payload["prompt"] = prompt
            # Include first image URL if present
            for m in messages:
                if isinstance(m.get("content"), list):
                    for item in m["content"]:
                        if item.get("type") == "image_url":
                            worker_payload["image"] = item["image_url"]
                            break

        else:
            # Dynamic MLX worker (generic text-only)
            prompt = build_dynamic_plaintext_prompt(messages)
            worker_payload["prompt"] = prompt

            # Conservative sampling (tiny models loop less with lower temp)
            worker_payload["temperature"] = float(payload.get("temperature") or 0.4)
            worker_payload["top_p"] = float(payload.get("top_p") or 0.9)

            # Keep completions short by default
            if not worker_payload.get("max_new_tokens"):
                worker_payload["max_new_tokens"] = 96

            # Strong default stops: include both '###' and plain labels, plus end tokens
            default_stops = [
                "### User:", "### System:", "### Assistant:",
                "\nUser:", "\nSystem:", "\nAssistant:",
                "User:", "System:", "Assistant:",
                "<|eot_id|>", "</s>", "<|endoftext|>"
            ]
            incoming = stop or []
            worker_payload["stop"] = list(dict.fromkeys([*incoming, *default_stops]))


        # add stop (possibly updated for llama)
        worker_payload["stop"] = stop

        # ---------- Call worker ----------
        timeout = httpx.Timeout(60.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            model_url = f"http://localhost:{port}/worker_generate"
            response = await client.post(model_url, json=worker_payload)

            # If worker failed, surface its error body (JSON or text) instead of raising blindly
            if response.status_code >= 400:
                try:
                    err_body = response.json()
                except Exception:
                    err_body = {"raw": response.text}
                # Log for server console visibility
                print(f"❌ Worker error {response.status_code} from {model_url}: {err_body}")
                return JSONResponse(status_code=500, content={"error": err_body})

            result = response.json()
            text = result.get("text", "")
            if port not in MODEL_PORTS.values():  # i.e., dynamic
                text = _clean_dynamic_output(text)

        return JSONResponse({
            "id": "chatcmpl-custom-001",
            "object": "chat.completion",
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": text},
                "finish_reason": "stop",
            }],
            "usage": result.get("usage", {}),
        })


    except Exception as e:
        print("❌ ERROR forwarding to model worker:")
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": repr(e)})

