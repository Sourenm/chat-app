from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from transformers import pipeline
import uvicorn
import torch
import logging
import traceback
import re

def extract_last_assistant_block(text: str) -> str:
    """
    Extracts the last `|assistant|` block from the text.
    """
    matches = list(re.finditer(r"\|assistant\|\n(.*?)(?=(\n\|user\||\Z))", text, flags=re.DOTALL))
    if matches:
        return matches[-1].group(1).strip()
    return text.strip()  # fallback


# --------------------------
# ✅ Configure Logging
# --------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)

logger = logging.getLogger(__name__)

logger.info("📦 Loading HuggingFace Transformers pipeline...")

# --------------------------
# ✅ Model Setup
# --------------------------
device = "mps" if torch.backends.mps.is_available() else "cpu"

pipe = pipeline(
    "text-generation",
    model="meta-llama/Llama-3.2-1B-Instruct",
    device=device,
    max_new_tokens=512,
)

app = FastAPI()

# --------------------------
# ✅ Main Handler
# --------------------------
@app.post("/worker_generate")
async def worker_generate(request: Request):
    try:
        data = await request.json()
        logger.info(f"💬 Received prompt: {data.get('prompt', '')}")
        prompt = data.get("prompt", "")
        temperature = data.get("temperature", 0.7)
        top_p = data.get("top_p", 1.0)
        max_tokens = data.get("max_new_tokens", 512)
        # Format using LLaMA-style prompt template
        formatted_prompt = f"### Instruction:\n{prompt.strip()}\n\n### Response:\n"

        # Run generation
        output = pipe(
            formatted_prompt,
            temperature=temperature,
            top_p=top_p,
            max_new_tokens=max_tokens,
        )[0]["generated_text"]
        
        output = extract_last_assistant_block(output)

        # Handle <|assistant|> repetition manually
        if "<|assistant|>" in output:
            # Split on each appearance
            parts = output.split("<|assistant|>")
            result_text = parts[1].strip() if len(parts) > 1 else output.strip()
        else:
            result_text = output.strip()

        # Remove echo of formatted prompt
        if output.startswith(formatted_prompt):
            result_text = output[len(formatted_prompt):].strip()
        else:
            result_text = output.strip()

        # Truncate at next section heading like "###" to stop over-generation
        if "###" in result_text:
            result_text = result_text.split("###")[0].strip()


        logger.info(f"🧠 Response: {result_text.strip()}")

        return JSONResponse({
            "text": result_text.strip(),
            "usage": {
                "prompt_tokens": len(data["prompt"].split()),
                "completion_tokens": len(result_text.split()),
                "total_tokens": len(data["prompt"].split()) + len(result_text.split()),
            }
        })

    except Exception as e:
        logger.error("❌ ERROR in worker_generate:")
        logger.error(traceback.format_exc())
        return JSONResponse(status_code=500, content={"error": str(e)})

# --------------------------
# ✅ Startup
# --------------------------
if __name__ == "__main__":
    logger.info("🚀 Starting model_worker on http://localhost:21002 ...")
    uvicorn.run(app, host="0.0.0.0", port=21002)
