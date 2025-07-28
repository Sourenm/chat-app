from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from mlx_vlm import load, generate
from mlx_vlm.prompt_utils import apply_chat_template
import uvicorn
import requests
import io
from PIL import Image
import logging
import traceback

# --------------------------
# ✅ Configure Logging
# --------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)
logger.info("📦 Loading Qwen2-VL-2B-Instruct-4bit model...")

# --------------------------
# ✅ Load MLX model + processor
# --------------------------
model_id = "mlx-community/Qwen2-VL-2B-Instruct-4bit"
model, processor = load(model_id)

app = FastAPI()

# --------------------------
# ✅ Inference Route
# --------------------------
@app.post("/worker_generate")
async def worker_generate(request: Request):
    try:
        data = await request.json()

        prompt = data.get("prompt", "")
        image_url = data.get("image", None)
        temperature = data.get("temperature", 0.7)
        top_p = data.get("top_p", 1.0)
        max_tokens = data.get("max_new_tokens", 512)

        logger.info(f"📨 Prompt: {prompt}")
        logger.info(f"🖼️ Image URL: {image_url}")

        image = None
        if image_url:
            response = requests.get(image_url)
            image = Image.open(io.BytesIO(response.content)).convert("RGB")

        formatted_prompt = apply_chat_template(processor, prompt, num_images=1 if image else 0)

        # Run generation
        response_text = generate(
            model,
            processor,
            formatted_prompt,
            [image] if image else None,
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,
        ).strip()

        logger.info(f"🧠 Response: {response_text}")

        return JSONResponse({
            "text": response_text,
            "usage": {
                "prompt_tokens": len(prompt.split()),
                "completion_tokens": len(response_text.split()),
                "total_tokens": len(prompt.split()) + len(response_text.split()),
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
    logger.info("🚀 Starting model_worker_vlm on http://localhost:21003 ...")
    uvicorn.run(app, host="0.0.0.0", port=21003)