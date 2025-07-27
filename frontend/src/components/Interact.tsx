import { Box } from '@mui/joy';
import { useState } from 'react';
import ChatPage from './ChatPage';
import { sendToBackend } from '../lib/api';

export default function Interact({ supports }) {
  const [chats, setChats] = useState([]);
  const [isThinking, setIsThinking] = useState(false);

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

    const messages = updatedChats.map((c) => ({
      role: c.user === 'bot' ? 'assistant' : 'user',
      content: c.t,
    }));

    const responseText = await sendToBackend(messages);

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
      />
    </Box>
  );
}
