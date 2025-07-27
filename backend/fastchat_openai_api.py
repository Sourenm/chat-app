import httpx
from fastapi import Request
from fastapi.responses import JSONResponse
import traceback

MODEL_WORKER_URL = "http://localhost:21002/worker_generate"

async def chat_completion(request: Request):
    try:
        payload = await request.json()

        # Extract the last user message
        messages = payload.get("messages", [])
        print(f"🔍 MESSAGES: {messages}")

        if not messages:
            return JSONResponse(status_code=400, content={"error": "No messages provided"})

        prompt = ""
        for m in messages:
            if m["role"] == "system":
                prompt += f"<|system|>\n{m['content']}\n"
            elif m["role"] == "user":
                prompt += f"<|user|>\n{m['content']}\n"
            elif m["role"] == "assistant":
                prompt += f"<|assistant|>\n{m['content']}\n"
        prompt += "<|assistant|>\n"  # Let model complete this part


        worker_payload = {
            "prompt": prompt,
            "temperature": payload.get("temperature", 0.7),
            "top_p": payload.get("top_p", 1.0),
            "max_new_tokens": payload.get("max_tokens", 512),
        }
        timeout = httpx.Timeout(60.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(MODEL_WORKER_URL, json=worker_payload)
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
