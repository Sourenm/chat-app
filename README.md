# 🧠 Chat App (Electron + React + FastAPI + Hugging Face)

This is a lightweight full-stack AI chat application with a modern **Electron + React + MUI frontend** and a **FastAPI + Hugging Face backend**. It supports natural language conversation (text inputs) with Meta’s LLaMA-3.2-1B-Instruct model and multimodal conversation (text+image inputs) with MLX Community's Qwen2-VL-2B model. This project runs natively with Apple Silicon–optimized MPS inference.

---

## Supported Models

This app supports both text-only and multimodal (image + text) inference:

| Model                             | Type       | Notes                                  |
|----------------------------------|------------|----------------------------------------|
| meta-llama/Llama-3.2-1B-Instruct | Text-only  | Lightweight, fast local inference      |
| mlx-community/Qwen2-VL-2B        | Multimodal | Supports image + text joint reasoning  |

## ✨ Features

### ✅ Frontend (Electron + React)
- Built with **Vite**, **TypeScript**, **MUI + Joy UI**
- Electron desktop app with full-width chat interface
- Supports sending **text** inputs
- Communicates via OpenAI-compatible `/v1/chat/completions` endpoint

### ✅ Backend (FastAPI + Hugging Face)
- **FastAPI** server with CORS and `/v1/chat/completions`
- Automatically launches `model_worker.py` on startup
- Model runs with **`transformers.pipeline`** on **MPS (Apple Silicon)** or CPU
- Outputs OpenAI-style responses with token usage

---

## 🧱 Folder Structure

```
chat-app/
├── backend/
│   ├── api.py
│   ├── fastchat_openai_api.py
│   ├── model_worker.py
│   ├── model_worker_qwen.py
│   └── requirements.txt
└── frontend/
    ├── public/
    ├── src/
    │   ├── components/
    │   ├── App.tsx
    │   ├── main.tsx
    ├── electron/
    │   └── main.js
    ├── vite.config.ts
    ├── package.json
    └── tsconfig.json
    └── tsconfig.node.json    
    └── tsconfig.app.json    
```

---

## 🚀 Getting Started

### 🔧 1. Backend Setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Then launch the API with:

```bash
uvicorn api:app --host 0.0.0.0 --port 8000
```

This will auto-launch `model_worker.py` if it's not already running.

> 💡 Make sure `torch`, `transformers`, and Apple MPS support are properly installed.

---

### 💻 2. Frontend Setup

```bash
cd frontend
npm install
```

#### Run for Development (with Electron)

```bash
npm run dev:electron
```

#### Build for Production

```bash
npm run build
```

---

## UI

- A model selector dropdown at the top allows switching between available models.
- Supports attaching images (from file or URL) for multimodal prompts.
- Automatically scrolls to the latest message after assistant responses.

## 📝 API

**POST** `/v1/chat/completions`

Request sample:
```json
{
  "model": "meta-llama/Llama-3.2-1B-Instruct",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "temperature": 0.7,
  "top_p": 1,
  "max_tokens": 512
}
```

Response:
```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "Hi! How can I help you today?"
      }
    }
  ],
  "usage": {
    "prompt_tokens": 5,
    "completion_tokens": 12,
    "total_tokens": 17
  }
}
```

## 📦 Dependencies

### Backend

- Multimodal prompts are parsed safely: base64 image data is extracted and excluded from tokenized text.
- Prompts are truncated before formatting to respect model limits (32768 tokens).
- Backend routes are model-aware and extract text + image cleanly.

- `fastapi`
- `uvicorn`
- `transformers`
- `torch`
- `httpx`
- `mlx`
- `mlx-vlm`

### Frontend
- `react`, `react-dom`
- `@mui/joy`, `@emotion/react`
- `electron`, `vite`
- `lucide-react`, `react-markdown`, `rehype-raw`
- `typescript`

---

## 🔐 License

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

[http://www.apache.org/licenses/LICENSE-2.0](http://www.apache.org/licenses/LICENSE-2.0)

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
