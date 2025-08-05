import httpx
from fastapi import Request
from fastapi.responses import JSONResponse
import traceback

# Port mapping for each supported model
MODEL_PORTS = {
    "meta-llama/Llama-3.2-1B-Instruct": 21002,
    "mlx-community/Qwen2-VL-2B-Instruct-4bit": 21003,
}

async def chat_completion(request: Request):
    try:
        payload = await request.json()

        model_name = payload.get("model", "meta-llama/Llama-3.2-1B-Instruct")
        print(f"Got Model: {model_name}")
        port = MODEL_PORTS.get(model_name)

        if not port:
            return JSONResponse(status_code=400, content={"error": f"Unknown model: {model_name}"})

        model_url = f"http://localhost:{port}/worker_generate"
        print(f"Forwarding to model worker at {model_url}")
        # Extract the chat messages
        messages = payload.get("messages", [])

        if not messages:
            return JSONResponse(status_code=400, content={"error": "No messages provided"})

        prompt = ""
        for m in messages:
            if m["role"] == "system":
                prompt += f"<|system|>\n{m['content']}\n"
            elif m["role"] == "assistant":
                prompt += f"<|assistant|>\n{m['content']}\n"
            elif m["role"] == "user":
                content = m["content"]
                if isinstance(content, list):
                    # Multimodal format
                    text_parts = [part["text"] for part in content if part["type"] == "text"]
                    prompt += f"<|user|>\n{''.join(text_parts)}\n"
                else:
                    prompt += f"<|user|>\n{content}\n"
        prompt += "<|assistant|>\n"

        # Prepare payload for the model worker
        worker_payload = {
            "prompt": prompt,
            "temperature": payload.get("temperature", 0.7),
            "top_p": payload.get("top_p", 1.0),
            "max_new_tokens": payload.get("max_tokens", 512),
            "adapter_name": payload.get("adapter_name"),  # ← added
        }

        # Include image URL for multimodal models (QWEN-style)
        if model_name == "mlx-community/Qwen2-VL-2B-Instruct-4bit":
            for m in messages:
                if isinstance(m["content"], list):
                    for item in m["content"]:
                        if item["type"] == "image_url":
                            worker_payload["image"] = item["image_url"]
                            break

        # Send to selected model worker
        timeout = httpx.Timeout(60.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(model_url, json=worker_payload)
            response.raise_for_status()
            result = response.json()

        # Format like OpenAI API response
        return JSONResponse({
            "id": "chatcmpl-custom-001",
            "object": "chat.completion",
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": result["text"]},
                    "finish_reason": "stop",
                }
            ],
            "usage": result.get("usage", {}),
        })

    except Exception as e:
        print("❌ ERROR forwarding to model worker:")
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": repr(e)})
