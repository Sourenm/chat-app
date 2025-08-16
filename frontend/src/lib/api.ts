// src/lib/api.ts
const BASE = 'http://localhost:8000';

/* ---------- existing helpers (keep yours if already present) ---------- */
export async function sendToBackend(
  messages: any[],
  model: string,
  image?: string | null,
  adapter?: string | null
) {
  const res = await fetch('http://localhost:8000/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      // optional extras your backend can read
      adapter: adapter || null,
      // if you also want to forward an inline image url/dataURI for VL models:
      image: image || null
    })
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Backend error ${res.status}: ${t}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
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

export async function ragIndex(
  indexName: string,
  files: File[],
  chunkSize = 850,
  chunkOverlap = 120,
  legal = false,                 // NEW (backward compatible)
  effectiveDate?: string         // NEW (YYYY-MM-DD)
) {
  const fd = new FormData();
  fd.append('index_name', indexName);
  fd.append('chunk_size', String(chunkSize));
  fd.append('chunk_overlap', String(chunkOverlap));
  for (const f of files) fd.append('files', f);

  // NEW fields
  fd.append('legal', legal ? 'true' : 'false');
  if (effectiveDate) fd.append('effective_date', effectiveDate);

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

// lib/api.ts (append these)
export async function orchestrateStory(payload: {
  narrative: string;
  image?: string | null;
  rag_docs?: string[] | null;
  rag_index_name?: string | null;
  build_index?: boolean;
  finetune?: boolean;
  finetune_dataset?: string | null;
  adapter_name?: string | null;
  num_epochs?: number;
  learning_rate?: number;
  lora_r?: number;
  lora_alpha?: number;
  lora_dropout?: number;
  num_illustrations?: number;
  illustration_prompt_hint?: string | null;
}) {
  const res = await fetch('http://localhost:8000/orchestrate_story', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  const data = await res.json();

  // Convert audio data URL to a Blob URL for the audio tag (like TTSPage does)
  let audioBlobUrl: string | null = null;
  if (data?.audio_wav_b64?.startsWith('data:audio/')) {
    const resp = await fetch(data.audio_wav_b64);
    const blob = await resp.blob();
    audioBlobUrl = URL.createObjectURL(blob);
  }

  // Convert each illustration data URL to Blob URL for display/saving
  const illustrationBlobUrls: string[] = [];
  if (Array.isArray(data?.illustrations)) {
    for (const durl of data.illustrations) {
      const resp = await fetch(durl);
      const blob = await resp.blob();
      illustrationBlobUrls.push(URL.createObjectURL(blob));
    }
  }

  return {
    scene_summary: data.scene_summary || '',
    story_text: data.story_text || '',
    adapter_used: data.adapter_used || null,
    rag_index_name: data.rag_index_name || null,
    audioBlobUrl,
    illustrationBlobUrls,
  };
}

export async function loadDynamicModel(hfModelId: string, maxNewTokens = 512) {
  const r = await fetch('http://localhost:8000/mlx/load', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hf_model_id: hfModelId, max_new_tokens: maxNewTokens }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Failed to load model: ${t}`);
  }
  return r.json(); // { status, model, port }
}

export async function unloadDynamicModel(hfModelId: string) {
  const r = await fetch('http://localhost:8000/mlx/unload', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hf_model_id: hfModelId }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Failed to unload model: ${t}`);
  }
  return r.json(); // { status, model }
}