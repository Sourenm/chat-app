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
    allow_origins=["*"],  # For security, use your actual frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_PORT = 21002
MODEL_URL = f"http://localhost:{MODEL_PORT}"

def is_port_open(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1.0)
        return s.connect_ex((host, port)) == 0

def wait_for_port(port: int, retries: int = 10, delay: float = 1.5) -> bool:
    for attempt in range(retries):
        if is_port_open("localhost", port):
            print(f"✅ model_worker is running on port {port}")
            return True
        print(f"⏳ Waiting for model_worker to start... (attempt {attempt+1}/{retries})")
        time.sleep(delay)
    return False

@app.on_event("startup")
async def startup_event():
    print("🚀 Starting API server and launching model_worker.py if needed...")

    if not is_port_open("localhost", MODEL_PORT):
        print("🔁 Launching model_worker.py...")
        subprocess.Popen(
            ["python3", "model_worker.py"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=os.path.dirname(os.path.abspath(__file__)),
        )

        if not wait_for_port(MODEL_PORT):
            print(f"❌ model_worker did not start on port {MODEL_PORT}")
        else:
            print("✅ model_worker is ready.")
    else:
        print(f"✅ model_worker already running on port {MODEL_PORT}")

@app.post("/v1/chat/completions")
async def chat_endpoint(request: Request):
    print("📥 Received /v1/chat/completions POST request")
    return await chat_completion(request)
