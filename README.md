# 🧠 Chat App (Electron + React + FastAPI + Hugging Face)

This is a lightweight full-stack AI chat application with a modern **Electron + React + MUI frontend** and a **FastAPI + Hugging Face backend**. It supports natural language conversation with Meta’s LLaMA-3.2-1B-Instruct model and runs natively with Apple Silicon–optimized MPS inference.

---

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

## 📝 API

**POST** `/v1/chat/completions`

Request:
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

---

## 🧠 Model Notes

- Using `transformers.pipeline("text-generation")`
- Automatically truncates responses after first "###" to avoid long rambling completions
- Uses an instruction-tuned prompt format like:

```
### Instruction:
<your message here>

### Response:
```

---

## 📦 Dependencies

### Backend
- `fastapi`
- `uvicorn`
- `transformers`
- `torch`
- `httpx`

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
