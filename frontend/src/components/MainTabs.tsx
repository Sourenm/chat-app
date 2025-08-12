// MainTabs.tsx
import {
  Box,
  Select,
  Option,
  Typography,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Button,
  Switch
} from '@mui/joy';
import { useState, useEffect } from 'react';
import FineTuneModal from './FineTuneModal';
import ChatPage from './ChatPage';
import DiffusionPage from './DiffusionPage';
import TTSPage from './TTSPage';
import KnowledgePage from './KnowledgePage';
import StoryPage from './StoryPage';
import { getAdapters } from '../lib/api';
import { sendToBackend, ragQuery, ragGetIndexes } from '../lib/api';

export default function MainTabs({ supports }) {
  const [tabIndex, setTabIndex] = useState(0);
  const [chats, setChats] = useState<any[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [model, setModel] = useState("meta-llama/Llama-3.2-1B-Instruct");
  const [adapter, setAdapter] = useState<string | null>(null);
  const [adapters, setAdapters] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  // NEW: RAG state
  const [ragEnabled, setRagEnabled] = useState(false);
  const [ragIndexName, setRagIndexName] = useState('default');
  const [availableIndexes, setAvailableIndexes] = useState<{ index_name: string; size: number }[]>([]);

  useEffect(() => {
    getAdapters().then(setAdapters);
    ragGetIndexes().then(setAvailableIndexes);
  }, []);

  const refreshIndexes = async () => setAvailableIndexes(await ragGetIndexes());

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

    try {
      if (ragEnabled) {
        // 🔎 RAG first
        const { answer, sources } = await ragQuery(ragIndexName, visiblePrompt, 5);
        const botMessage = {
          t: answer,
          user: 'bot',
          key: Math.random().toString(36).substring(2),
          sources, // will render as citation chips
        };
        setChats((prev) => [...prev, botMessage]);
      } else {
        // 🤖 normal chat
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
      }
    } catch (e: any) {
      const botMessage = {
        t: `❌ Error: ${e.message}`,
        user: 'bot',
        key: Math.random().toString(36).substring(2),
      };
      setChats((prev) => [...prev, botMessage]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <Box sx={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Fixed top bar */}
      <Box sx={{ p: 1, borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, flexWrap: 'wrap' }}>
        <Typography sx={{ mr: 1 }}>Model:</Typography>
        <Select value={model} onChange={(_, value) => {
          if (value) {
            setModel(value);
            setChats([]);
            setAdapter(null);
          }
        }} sx={{ minWidth: 300 }} disabled={tabIndex !== 0}>
          <Option value="meta-llama/Llama-3.2-1B-Instruct">📝 LLaMA 3.2 1B</Option>
          <Option value="mlx-community/Qwen2-VL-2B-Instruct-4bit">🖼️ QWEN2 VL 2B</Option>
        </Select>

        {model === "meta-llama/Llama-3.2-1B-Instruct" && (
          <>
            <Select
              placeholder="Adapter"
              value={adapter || ""}
              onChange={(_, value) => setAdapter(value)}
              sx={{ minWidth: 200 }}
              disabled={tabIndex !== 0}
            >
              <Option value="">(None)</Option>
              {adapters.map((a) => (
                <Option key={a} value={a}>{a}</Option>
              ))}
            </Select>
            <Button size="sm" variant="outlined" onClick={() => setModalOpen(true)} disabled={tabIndex !== 0}>
              Fine-Tune
            </Button>
          </>
        )}

        {/* NEW: RAG controls */}
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Switch
            checked={ragEnabled}
            onChange={(e) => setRagEnabled(e.target.checked)}
            disabled={tabIndex !== 0}
          />
          <Typography level="body-sm">Use Knowledge Base</Typography>

          <Select
            value={ragIndexName}
            onChange={(_, v) => v && setRagIndexName(v)}
            sx={{ minWidth: 180 }}
            disabled={!ragEnabled || tabIndex !== 0}
          >
            {availableIndexes.map((i) => (
              <Option key={i.index_name} value={i.index_name}>
                {i.index_name} ({i.size})
              </Option>
            ))}
          </Select>

          <Button
            size="sm"
            variant="plain"
            onClick={refreshIndexes}
            disabled={!ragEnabled || tabIndex !== 0}   // ⬅ disable when KB toggle off or wrong tab
          >
            Refresh
          </Button>

        </Box>
      </Box>

      {/* Main panel */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)} sx={{ height: '100%' }}>
          <TabList>
            <Tab>Interact</Tab>
            <Tab>Diffusion</Tab>
            <Tab>TTS</Tab>
            <Tab>Knowledge</Tab>
            <Tab>Story</Tab> 
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
              getAdapters().then(setAdapters);
            }} />
          </TabPanel>

          <TabPanel value={1} sx={{ height: '100%', overflow: 'auto' }}>
            <DiffusionPage />
          </TabPanel>

          <TabPanel value={2} sx={{ height: '100%', overflow: 'auto' }}>
            <TTSPage />
          </TabPanel>

          <TabPanel value={3} sx={{ height: '100%', overflow: 'auto' }}>
            <KnowledgePage />
          </TabPanel>
          <TabPanel value={4} sx={{ height: '100%', overflow: 'auto' }}>
            <StoryPage />
          </TabPanel>          
        </Tabs>
      </Box>
    </Box>
  );
}
