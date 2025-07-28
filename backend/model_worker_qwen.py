from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from mlx_vlm import load, generate
from mlx_vlm.prompt_utils import apply_chat_template
from mlx_vlm.utils import load_tokenizer
from mlx_vlm.utils import get_model_path
import uvicorn
import requests
import io
from PIL import Image
import logging
import traceback
import base64



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
model_path = get_model_path(model_id)
tokenizer = load_tokenizer(model_path)
config = {"chat_template": getattr(processor.tokenizer, "chat_template", "chatml"), "model_type": "qwen2_vl"}

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

        # --------------------------
        # ✅ Load image
        # --------------------------
        image = None
        if image_url:
            if image_url.startswith("data:image"):
                header, encoded = image_url.split(",", 1)
                image_bytes = base64.b64decode(encoded)
                image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            else:
                response = requests.get(image_url)
                image = Image.open(io.BytesIO(response.content)).convert("RGB")

        # --------------------------
        # ✅ Truncate raw prompt BEFORE formatting
        # --------------------------
        MAX_MODEL_TOKENS = 32768
        EST_IMAGE_TOKENS = 1024
        MAX_TEXT_TOKENS = MAX_MODEL_TOKENS - EST_IMAGE_TOKENS

        raw_input_ids = tokenizer.encode(prompt, return_tensors="pt")
        if raw_input_ids.shape[-1] > MAX_TEXT_TOKENS:
            logger.warning(f"⚠️ Truncating prompt from {raw_input_ids.shape[-1]} to {MAX_TEXT_TOKENS}")
            raw_input_ids = raw_input_ids[:, -MAX_TEXT_TOKENS:]
            prompt = tokenizer.decode(raw_input_ids[0], skip_special_tokens=False)

        # --------------------------
        # ✅ Apply template
        # --------------------------
        formatted_prompt = apply_chat_template(
            processor,
            config,
            [{"role": "user", "content": prompt}],
            num_images=1 if image else 0
        )

        input_ids = tokenizer.encode(formatted_prompt, return_tensors="pt")
        if input_ids.shape[-1] > MAX_MODEL_TOKENS:
            logger.error(f"❌ Final formatted prompt too long: {input_ids.shape[-1]} tokens")
            return JSONResponse(status_code=400, content={
                "error": f"Final formatted prompt exceeds model token limit ({MAX_MODEL_TOKENS})"
            })

        logger.info(f"🧮 Final prompt token count: {input_ids.shape[-1]}")

        # --------------------------
        # ✅ Generate
        # --------------------------
        response = generate(
            model,
            processor,
            formatted_prompt,
            [image] if image else None,
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,
        )
        response_text = response.text.strip()

        logger.info(f"🧠 Response: {response_text}")

        return JSONResponse({
            "text": response_text,
            "usage": {
                "prompt_tokens": input_ids.shape[-1],
                "completion_tokens": len(response_text.split()),
                "total_tokens": input_ids.shape[-1] + len(response_text.split()),
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