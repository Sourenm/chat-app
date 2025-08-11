// src/lib/api.ts
const BASE = 'http://localhost:8000';

/* ---------- existing helpers (keep yours if already present) ---------- */
export async function sendToBackend(messages: any[], model: string, image?: string) {
  const r = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages })
  });
  if (!r.ok) throw new Error(await r.text());
  const j = await r.json();
  return j?.choices?.[0]?.message?.content ?? '';
}

export async function generateDiffusionImage(prompt: string, imageData?: string) {
  const r = await fetch(`${BASE}/diffusion/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, image: imageData || null }),
  });
  if (!r.ok) throw new Error(await r.text());
  const j = await r.json();
  return j.image_url as string;
}

export async function generateTTS(text: string) {
  const r = await fetch(`${BASE}/generate_tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) throw new Error(await r.text());
  const blob = await r.blob();
  return URL.createObjectURL(blob);
}

export async function getDatasets() {
  const res = await fetch("http://localhost:8000/datasets");
  return res.json();
}

export async function getAdapters() {
  const res = await fetch("http://localhost:8000/adapters");
  return res.json();
}

export async function postFineTune(payload: {
  base_model: string;
  dataset_name: string;
  adapter_name: string;
  num_epochs: number;
  learning_rate: number;
  lora_r: number;
  lora_alpha: number;
  lora_dropout: number;
}) {
  const res = await fetch("http://localhost:8000/finetune", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

/* ---------- NEW: RAG helpers (fail-soft) ---------- */
export async function ragGetIndexes(): Promise<{ index_name: string; size: number }[]> {
  try {
    const r = await fetch(`${BASE}/rag/indexes`);
    if (!r.ok) return [];
    const j = await r.json();
    return j.indexes ?? [];
  } catch {
    return []; // don’t crash UI on mount
  }
}

export async function ragIndex(indexName: string, files: File[], chunkSize = 850, chunkOverlap = 120) {
  const fd = new FormData();
  fd.append('index_name', indexName);
  fd.append('chunk_size', String(chunkSize));
  fd.append('chunk_overlap', String(chunkOverlap));
  for (const f of files) fd.append('files', f);

  const r = await fetch(`${BASE}/rag/index`, { method: 'POST', body: fd });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function ragQuery(indexName: string, query: string, topK = 5) {
  const r = await fetch(`${BASE}/rag/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index_name: indexName, query, top_k: topK })
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function ragDeleteDocument(indexName: string, docId: string) {
  const r = await fetch(`${BASE}/rag/document/${encodeURIComponent(docId)}?index_name=${encodeURIComponent(indexName)}`, {
    method: 'DELETE'
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function ragDeleteIndex(indexName: string) {
  const r = await fetch(`${BASE}/rag/index/${encodeURIComponent(indexName)}`, {
    method: 'DELETE',
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
