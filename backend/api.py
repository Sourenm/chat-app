import subprocess
import socket
import time
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastchat_openai_api import chat_completion

app = FastAPI()

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

def is_port_open(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1.0)
        return s.connect_ex((host, port)) == 0

def wait_for_port(port: int, retries: int = None, delay: float = 2) -> bool:    
    if retries is not None:
        for attempt in range(retries):
            if is_port_open("localhost", port):
                print(f"✅ Worker is running on port {port}")
                return True
            print(f"⏳ Waiting for worker on port {port}... (attempt {attempt+1}/{retries})")
            time.sleep(delay)
        return False
    else:
        attempt = 0
        while True:
            if is_port_open("localhost", port):
                print(f"✅ Worker is running on port {port}")
                return True
            print(f"⏳ Waiting for worker on port {port}... (attempt {attempt+1}/{retries})")
            attempt += 1
            time.sleep(delay)

@app.on_event("startup")
async def startup_event():
    print("🚀 Starting API server and launching model workers if needed...")
    for model_name, cfg in MODEL_WORKERS.items():
        port = cfg["port"]
        script = cfg["script"]
        if not is_port_open("localhost", port):
            print(f"🔁 Launching {script}...")
            subprocess.Popen(
                ["python3", script],
                cwd=os.path.dirname(os.path.abspath(__file__)),
            )
            if not wait_for_port(port):
                print(f"❌ {script} did not start on port {port}")
            else:
                print(f"✅ {script} is ready.")
        else:
            print(f"✅ {script} already running on port {port}")

@app.post("/v1/chat/completions")
async def chat_endpoint(request: Request):
    print("📥 Received /v1/chat/completions POST request")
    return await chat_completion(request)
