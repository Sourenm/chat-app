import {
  Box,
  Select,
  Option,
  Typography,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Button
} from '@mui/joy';
import { useState, useEffect } from 'react';
import FineTuneModal from './FineTuneModal';
import ChatPage from './ChatPage';
import DiffusionPage from './DiffusionPage';
import { getAdapters } from '../lib/api'; // ✅ Add this
import { sendToBackend } from '../lib/api';

export default function MainTabs({ supports }) {
  const [tabIndex, setTabIndex] = useState(0);
  const [chats, setChats] = useState([]);
  const [isThinking, setIsThinking] = useState(false);
  const [model, setModel] = useState("meta-llama/Llama-3.2-1B-Instruct");
  const [adapter, setAdapter] = useState<string | null>(null);
  const [adapters, setAdapters] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    getAdapters().then(setAdapters);
  }, []);


  const sendNewMessageToLLM = async (
  visiblePrompt: string,
  image?: string,
  selectedModel?: string,
  fullPromptOverride?: string
  ) => {

    const userMessage = {
      t: visiblePrompt,
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

    const fullPrompt = fullPromptOverride || visiblePrompt;

    if (image) {
      messages.push({ role: 'user', content: [{ type: 'text', text: fullPrompt }, { type: 'image_url', image_url: image }] });
    } else {
      messages.push({ role: 'user', content: fullPrompt });
    }


    const responseText = await sendToBackend(messages, selectedModel || model, image);
    const botMessage = {
      t: responseText,
      user: 'bot',
      key: Math.random().toString(36).substring(2),
    };
    setChats((prev) => [...prev, botMessage]);

    setIsThinking(false);
  };

  return (
    <Box sx={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Fixed top bar */}
      <Box sx={{ p: 1, borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <Typography sx={{ mr: 1 }}>Model:</Typography>
        <Select value={model} onChange={(_, value) => {
          if (value) {
            setModel(value);
            setChats([]);
            setAdapter(null); // clear adapter on model switch
          }
        }} sx={{ minWidth: 300 }} disabled={tabIndex === 1}>
          <Option value="meta-llama/Llama-3.2-1B-Instruct">📝 LLaMA 3.2 1B</Option>
          <Option value="mlx-community/Qwen2-VL-2B-Instruct-4bit">🖼️ QWEN2 VL 2B</Option>
        </Select>

        {model === "meta-llama/Llama-3.2-1B-Instruct" && (
          <>
            <Select
              placeholder="Adapter"
              value={adapter || ""}
              onChange={(_, value) => setAdapter(value)}
              sx={{ minWidth: 200, ml: 2 }}
              disabled={tabIndex === 1}
            >
              <Option value="">(None)</Option>
              {adapters.map((a) => (
                <Option key={a} value={a}>{a}</Option>
              ))}
            </Select>
            <Button size="sm" variant="outlined" sx={{ ml: 2 }} onClick={() => setModalOpen(true)} disabled={tabIndex === 1}>
              Fine-Tune
            </Button>
          </>
        )}

      </Box>

      {/* Main panel */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)} sx={{ height: '100%' }}>
          <TabList>
            <Tab>Interact</Tab>
            <Tab>Diffusion</Tab>
          </TabList>

          <TabPanel value={0} sx={{ height: '100%', overflow: 'hidden', p: 0 }}>
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
              adapter={adapter}
            />
            <FineTuneModal open={modalOpen} onClose={() => {
              setModalOpen(false);
              getAdapters().then(setAdapters); // refresh list after training
            }} />

          </TabPanel>

          <TabPanel value={1} sx={{ height: '100%', overflow: 'auto' }}>
            <DiffusionPage />
          </TabPanel>
        </Tabs>
      </Box>
    </Box>
  );
}
