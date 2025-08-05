import os
import re
import torch
import logging
import traceback
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from transformers import pipeline, AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

# --------------------------
# ✅ Configure Logging
# --------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)

logger = logging.getLogger(__name__)

# --------------------------
# ✅ Prompt Extractor
# --------------------------
def extract_last_assistant_block(text: str) -> str:
    matches = list(re.finditer(r"\|assistant\|\n(.*?)(?=(\n\|user\||\Z))", text, flags=re.DOTALL))
    if matches:
        return matches[-1].group(1).strip()
    return text.strip()

# --------------------------
# ✅ Model Setup
# --------------------------
BASE_MODEL_NAME = "meta-llama/Llama-3.2-1B-Instruct"
DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"

logger.info(f"📦 Loading base model: {BASE_MODEL_NAME}")
base_model = AutoModelForCausalLM.from_pretrained(BASE_MODEL_NAME)
tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_NAME)

ADAPTER_CACHE = {}

def get_pipeline_with_adapter(adapter_name: str | None):
    if not adapter_name:
        logger.info("⚙️ Using base model (no adapter)")
        return pipeline(
            "text-generation",
            model=base_model,
            tokenizer=tokenizer,
            device=DEVICE,
            max_new_tokens=512,
        )

    if adapter_name in ADAPTER_CACHE:
        logger.info(f"✅ Using cached adapter: {adapter_name}")
        return ADAPTER_CACHE[adapter_name]

    adapter_path = os.path.join("adapters", adapter_name)
    if not os.path.exists(adapter_path):
        logger.warning(f"⚠️ Adapter not found: {adapter_path}. Using base model.")
        return pipeline(
            "text-generation",
            model=base_model,
            tokenizer=tokenizer,
            device=DEVICE,
            max_new_tokens=512,
        )

    logger.info(f"🧩 Loading adapter: {adapter_path}")
    adapted_model = PeftModel.from_pretrained(base_model, adapter_path)
    pipe = pipeline(
        "text-generation",
        model=adapted_model,
        tokenizer=tokenizer,
        device=DEVICE,
        max_new_tokens=512,
    )
    ADAPTER_CACHE[adapter_name] = pipe
    return pipe

# --------------------------
# ✅ App Setup
# --------------------------
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
        adapter_name = data.get("adapter_name")

        formatted_prompt = f"### Instruction:\n{prompt.strip()}\n\n### Response:\n"

        pipe = get_pipeline_with_adapter(adapter_name)

        output = pipe(
            formatted_prompt,
            temperature=temperature,
            top_p=top_p,
            max_new_tokens=max_tokens,
        )[0]["generated_text"]

        output = extract_last_assistant_block(output)

        if "<|assistant|>" in output:
            parts = output.split("<|assistant|>")
            result_text = parts[1].strip() if len(parts) > 1 else output.strip()
        else:
            result_text = output.strip()

        if output.startswith(formatted_prompt):
            result_text = output[len(formatted_prompt):].strip()
        else:
            result_text = output.strip()

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
    import uvicorn
    logger.info("🚀 Starting model_worker on http://localhost:21002 ...")
    uvicorn.run(app, host="0.0.0.0", port=21002)