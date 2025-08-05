export const sendToBackend = async (
  messages: any[],
  model: string,
  image?: string,
  adapter_name?: string
) => {
  const payload: any = {
    model,
    messages,
    temperature: 0.7,
    top_p: 1.0,
    max_tokens: 512,
  };

  if (image) {
    payload.image = image;
  }

  if (adapter_name) {
    payload.adapter_name = adapter_name;
  }

  const res = await fetch('http://localhost:8000/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
};


export async function generateDiffusionImage(prompt: string, image?: string): Promise<string> {
  const payload: any = { prompt };
  if (image) payload.image = image;

  const res = await fetch('http://localhost:8000/diffusion/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Backend error: ${err}`);
  }

  const data = await res.json();
  return data.image_url;
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
  const res = await fetch("/finetune", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}
