import asyncio
import socket
import time
import os
import json
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastchat_openai_api import chat_completion
from pydantic import BaseModel
from diffusion_worker import generate_image


app = FastAPI()


model_worker_procs = []

# Allow frontend to talk to us
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_WORKERS = {
    "meta-llama/Llama-3.2-1B-Instruct": {
        "port": 21002,
        "script": "model_worker.py"
    },
    "mlx-community/Qwen2-VL-2B-Instruct-4bit": {
        "port": 21003,
        "script": "model_worker_qwen.py"
    }
}

class DiffusionInput(BaseModel):
    prompt: str
    image: str | None = None  # base64 string if present


def is_port_open(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1.0)
        return s.connect_ex((host, port)) == 0

async def wait_for_port(port: int, retries: int = None, delay: float = 2) -> bool:
    if retries is not None:
        for attempt in range(retries):
            if is_port_open("localhost", port):
                print(f"✅ Worker is running on port {port}")
                return True
            print(f"⏳ Waiting for worker on port {port}... (attempt {attempt+1}/{retries})")
            await asyncio.sleep(delay)
        return False
    else:
        attempt = 0
        while True:
            if is_port_open("localhost", port):
                print(f"✅ Worker is running on port {port}")
                return True
            print(f"⏳ Waiting for worker on port {port}... (attempt {attempt+1}/∞)")
            attempt += 1

            try:
                await asyncio.sleep(delay)
            except asyncio.CancelledError:
                print("❌ Cancelled during wait_for_port")
                return False


async def launch_worker_and_wait(script: str, port: int):
    proc = await asyncio.create_subprocess_exec(
        "python3", script,
        cwd=os.path.dirname(os.path.abspath(__file__))
    )
    model_worker_procs.append(proc)

    try:
        success = await asyncio.wait_for(wait_for_port(port), timeout=60)
    except asyncio.TimeoutError:
        print(f"❌ Timeout: {script} did not start on port {port} in time")
        proc.terminate()
        await proc.wait()
        return
    except asyncio.CancelledError:
        print("⛔ Startup cancelled during worker wait!")
        proc.terminate()
        await proc.wait()
        return

    if success:
        print(f"✅ {script} is ready.")
    else:
        print(f"❌ {script} failed to start.")



@app.on_event("startup")
async def startup_event():
    print("🚀 Starting API server and launching model workers if needed...")
    for model_name, cfg in MODEL_WORKERS.items():
        port = cfg["port"]
        script = cfg["script"]

        if not is_port_open("localhost", port):
            print(f"🔁 Launching {script}...")

            # launch in background to prevent blocking startup
            asyncio.create_task(launch_worker_and_wait(script, port))
        else:
            print(f"✅ {script} already running on port {port}")


@app.on_event("shutdown")
async def shutdown_event():
    print("🛑 Shutting down model workers...")
    for proc in model_worker_procs:
        proc.terminate()
        try:
            await asyncio.wait_for(proc.wait(), timeout=5)
            print("✅ Worker terminated")
        except asyncio.TimeoutError:
            print("⚠️ Worker did not terminate in time, killing...")
            proc.kill()

@app.post("/v1/chat/completions")
async def chat_endpoint(request: Request):
    print("📥 Received /v1/chat/completions POST request")
    body_bytes = await request.body()
    try:
        body_json = json.loads(body_bytes)
        print("📦 Request body JSON:")
        for k, v in body_json.items():
            print(f"  - {k}: {v}")
    except Exception as e:
        print(f"⚠️ Failed to parse body: {e}")
        print(f"Raw body: {body_bytes.decode('utf-8', errors='replace')}")    
    return await chat_completion(request)


@app.post("/diffusion/generate")
async def diffusion_generate(req: DiffusionInput):
    print(f"🧠 Received prompt: {req.prompt}", flush=True)
    if req.image:
        print("🖼️ Image-to-image mode enabled", flush=True)
    else:
        print("📝 Text-to-image mode enabled", flush=True)

    image_url = await generate_image(req.prompt, req.image)
    return { "image_url": image_url }