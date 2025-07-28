import { Box, Select, Option, Typography } from '@mui/joy';
import { useState } from 'react';
import ChatPage from './ChatPage';
import { sendToBackend } from '../lib/api';

export default function Interact({ supports }) {
  const [chats, setChats] = useState([]);
  const [isThinking, setIsThinking] = useState(false);
  const [model, setModel] = useState("meta-llama/Llama-3.2-1B-Instruct"); // 👈 default model

  const sendNewMessageToLLM = async (text: string, image?: string) => {
    const userMessage = {
      t: text,
      user: 'human',
      key: Math.random().toString(36).substring(2),
      image,
    };
    const updatedChats = [...chats, userMessage];
    setChats(updatedChats);
    setIsThinking(true);

    // Format messages
    const messages = updatedChats.map((c) => ({
      role: c.user === 'bot' ? 'assistant' : 'user',
      content: c.t,
    }));

    if (image) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text },
          { type: 'image_url', image_url: image },
        ],
      });
    } else {
      messages.push({ role: 'user', content: text });
    }

    const responseText = await sendToBackend(messages, model, image); // ✅ pass model + image

    const botMessage = {
      t: responseText,
      user: 'bot',
      key: Math.random().toString(36).substring(2),
    };
    setChats((prev) => [...prev, botMessage]);
    setIsThinking(false);
  };

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box sx={{ p: 1, borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center' }}>
        <Typography sx={{ mr: 1 }}>Model:</Typography>
        <Select
          value={model}
          onChange={(_, value) => value && setModel(value)}
          sx={{ minWidth: 300 }}
        >
          <Option value="meta-llama/Llama-3.2-1B-Instruct">📝 LLaMA 3.2 1B (Text-only)</Option>
          <Option value="mlx-community/Qwen2-VL-2B-Instruct-4bit">🖼️ QWEN2 VL 2B (Multimodal)</Option>
        </Select>
      </Box>

      <ChatPage
        chats={chats}
        setChats={setChats}
        isThinking={isThinking}
        sendNewMessageToLLM={sendNewMessageToLLM}
        stopStreaming={() => setIsThinking(false)}
        tokenCount={{}}
        text=""
        debouncedText=""
        supports={supports}
        model={model}
      />
    </Box>
  );
}
