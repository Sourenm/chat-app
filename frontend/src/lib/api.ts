export const sendToBackend = async (messages: any[]) => {
  const payload = {
    model: 'meta-llama/Llama-3.2-1B-Instruct',
    messages: messages,
    temperature: 0.7,
    top_p: 1.0,
    max_tokens: 512,
  };

  const res = await fetch('http://localhost:8000/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
};
