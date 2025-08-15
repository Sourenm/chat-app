# dynamic_mlx_worker.py
import os
import sys
import traceback

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn

# mlx_lm API is (model, tokenizer) = load(...); generate(model, tokenizer, ...)
from mlx_lm import load, generate
import re

DEFAULT_STOPS = ["### User:", "### System:", "<|eot_id|>", "</s>", "<|endoftext|>"]

try:
    # Pydantic v2
    from pydantic import ConfigDict
    _MODEL_CONFIG = {"model_config": ConfigDict(extra="ignore")}
except Exception:
    # Pydantic v1
    class _Base(BaseModel):
        class Config:
            extra = "ignore"
    BaseModel = _Base
    _MODEL_CONFIG = {}

MODEL_ID = os.environ.get("DYN_MLX_MODEL_ID", "")
PORT = int(os.environ.get("DYN_MLX_PORT", "21100"))
STANDALONE = os.environ.get("DYN_MLX_STANDALONE") == "1"

app = FastAPI()

# Globals set on startup
_mlx_model = None
_tokenizer = None

class GenRequest(BaseModel):
    prompt: str
    max_new_tokens: int | None = 64
    temperature: float | None = 0.7
    top_p: float | None = 0.95
    stop: list[str] | None = None
    if _MODEL_CONFIG:
        locals().update(_MODEL_CONFIG)

def _safe_generate(model, tokenizer, prompt, *, max_new_tokens, temperature, top_p, stop):
    # Build kwargs using the most compatible names
    kwargs = {"max_tokens": int(max_new_tokens or 64)}
    if temperature is not None:
        kwargs["temperature"] = float(temperature)
    if top_p is not None:
        kwargs["top_p"] = float(top_p)
    if stop:
        kwargs["stop"] = list(stop)

    # Try, and if an unexpected kwarg is rejected, drop it and retry
    while True:
        try:
            return generate(model, tokenizer, prompt, **kwargs)
        except TypeError as e:
            msg = str(e)
            m = re.search(r"unexpected keyword argument '([^']+)'", msg)
            if not m:
                raise
            bad = m.group(1)
            if bad in kwargs:
                kwargs.pop(bad, None)
                # Retry without the offending kwarg
                continue
            # If the offending arg name isn't in kwargs, just re-raise
            raise


@app.get("/health")
def health():
    ok = _mlx_model is not None
    return {"ok": ok, "model_id": MODEL_ID}

@app.on_event("startup")
def _startup():
    global _mlx_model, _tokenizer
    if not STANDALONE:
        # Imported somewhere? Don’t try to load.
        return
    if not MODEL_ID:
        # Fail fast, so parent process can read stderr.
        print("DYN_MLX_MODEL_ID must be set", file=sys.stderr, flush=True)
        sys.exit(1)

    try:
        # trust_remote_code helps for custom tokenizers/config
        _mlx_model, _tokenizer = load(MODEL_ID, tokenizer_config={"trust_remote_code": True})
    except Exception as e:
        traceback.print_exc()
        # Fail fast so /mlx/load can capture stderr
        sys.exit(1)

DEFAULT_STOPS = ["### User:", "### System:", "<|eot_id|>", "</s>", "<|endoftext|>"]

@app.post("/generate")
def generate_text(req: GenRequest):
    if _mlx_model is None:
        return JSONResponse(status_code=503, content={"error": "Model not loaded"})
    try:
        text = _safe_generate(
            _mlx_model,
            _tokenizer,
            req.prompt,
            max_new_tokens=req.max_new_tokens or 64,
            temperature=req.temperature,
            top_p=req.top_p,
            stop=(req.stop or DEFAULT_STOPS),
        )
        return {"text": text, "usage": {}}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": f"{type(e).__name__}: {e}"})

@app.post("/worker_generate")
def worker_generate(req: GenRequest):
    return generate_text(req)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
