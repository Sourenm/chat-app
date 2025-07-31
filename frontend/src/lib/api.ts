export const sendToBackend = async (
  messages: any[],
  model: string,
  image?: string
) => {
  const payload: any = {
    model,
    messages,
    temperature: 0.7,
    top_p: 1.0,
    max_tokens: 512,
  };

  // If image is provided, include it
  if (image) {
    payload.image = image;
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

