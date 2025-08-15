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
  Switch,
  Modal,
  ModalDialog,
  DialogTitle,
  DialogContent,
  ModalClose,
  Input,
  Stack,
  CircularProgress
} from '@mui/joy';
import { useState, useEffect, useRef } from 'react';
import FineTuneModal from './FineTuneModal';
import ChatPage from './ChatPage';
import DiffusionPage from './DiffusionPage';
import TTSPage from './TTSPage';
import KnowledgePage from './KnowledgePage';
import StoryPage from './StoryPage';
import { getAdapters, sendToBackend, ragQuery, ragGetIndexes } from '../lib/api';
import { loadDynamicModel, unloadDynamicModel } from '../lib/api'; // ⬅ NEW

const STATIC_LLAMA = "meta-llama/Llama-3.2-1B-Instruct";
const STATIC_QWEN_VL = "mlx-community/Qwen2-VL-2B-Instruct-4bit";
const PASTE_HF_ID = "__paste_hf_id__";

export default function MainTabs({ supports }) {
  const [tabIndex, setTabIndex] = useState(0);
  const [chats, setChats] = useState<any[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [model, setModel] = useState<string>(STATIC_LLAMA);
  const [adapter, setAdapter] = useState<string | null>(null);
  const [adapters, setAdapters] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  // NEW: dynamic worker tracking
  const [dynamicModelId, setDynamicModelId] = useState<string | null>(null);
  const lastDynamicRef = useRef<string | null>(null);

  // NEW: paste modal state
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteId, setPasteId] = useState("");
  const [pasteLoading, setPasteLoading] = useState(false);
  const pasteInputRef = useRef<HTMLInputElement | null>(null);

  // RAG state (unchanged)
  const [ragEnabled, setRagEnabled] = useState(false);
  const [ragIndexName, setRagIndexName] = useState('default');
  const [availableIndexes, setAvailableIndexes] = useState<{ index_name: string; size: number }[]>([]);

  useEffect(() => {
    getAdapters().then(setAdapters);
    ragGetIndexes().then(setAvailableIndexes);
  }, []);

  useEffect(() => {
    if (pasteOpen && pasteInputRef.current) {
      // slight delay so modal finishes opening
      setTimeout(() => pasteInputRef.current?.focus(), 50);
    }
  }, [pasteOpen]);

  const refreshIndexes = async () => setAvailableIndexes(await ragGetIndexes());

  async function maybeUnloadDynamic() {
    const dyn = lastDynamicRef.current;
    if (dyn) {
      try {
        await unloadDynamicModel(dyn);
      } catch (e) {
        // non-fatal; show nothing in UI, keep console clean
        console.warn("Unload dynamic model failed:", e);
      } finally {
        setDynamicModelId(null);
        lastDynamicRef.current = null;
      }
    }
  }

  const handleSelectModel = async (_: any, value: string | null) => {
    if (!value) return;

    // Choosing “Paste HF ID…” just opens the modal without changing current model
    if (value === PASTE_HF_ID) {
      setPasteOpen(true);
      return;
    }

    // If switching to a static model, unload any dynamic worker first
    if (value === STATIC_LLAMA || value === STATIC_QWEN_VL) {
      await maybeUnloadDynamic();
    }

    setModel(value);
    setChats([]);          // clear chat on model change
    setAdapter(null);      // clear adapter on model change
  };

  const onConfirmPaste = async () => {
    const hfId = pasteId.trim();
    if (!hfId) return;

    setPasteLoading(true);
    try {
      const res = await loadDynamicModel(hfId, 512); // backend blocks until ready
      // set new model to exact HF ID; router will forward to dynamic worker
      setModel(hfId);
      setDynamicModelId(hfId);
      lastDynamicRef.current = hfId;
      setChats([]);
      setAdapter(null);
      setPasteOpen(false);
      setPasteId("");
    } catch (e: any) {
      alert(e?.message || "Failed to load model.");
    } finally {
      setPasteLoading(false);
    }
  };

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
        const { answer, sources } = await ragQuery(ragIndexName, visiblePrompt, 5);
        const botMessage = {
          t: answer,
          user: 'bot',
          key: Math.random().toString(36).substring(2),
          sources,
        };
        setChats((prev) => [...prev, botMessage]);
      } else {
        const messages = updatedChats.map((c) => ({
          role: c.user === 'bot' ? 'assistant' : 'user',
          content: c.t,
        }));
        const fullPrompt = fullPromptOverride || visiblePrompt;
        if (image) {
          messages.push({
            role: 'user',
            content: [
              { type: 'text', text: fullPrompt },
              { type: 'image_url', image_url: image }
            ]
          });
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

  // Helper UI flags
  const isStatic = model === STATIC_LLAMA || model === STATIC_QWEN_VL;
  const showAdapter = model === STATIC_LLAMA; // adapters only for llama

  return (
    <Box sx={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Fixed top bar */}
      <Box
        sx={{
          px: 0.5,
          py: 1,
          borderBottom: '1px solid #ccc',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        <Typography sx={{ mr: 1 }}>Model:</Typography>

        <Select
          value={isStatic ? model : model} // keep controlled by HF ID when dynamic
          onChange={handleSelectModel}
          sx={{ minWidth: 360 }}
          disabled={tabIndex !== 0}
        >
          <Option value={STATIC_LLAMA}>📝 LLaMA 3.2 1B</Option>
          <Option value={STATIC_QWEN_VL}>🖼️ QWEN2 VL 2B</Option>
          <Option value={PASTE_HF_ID}>🔌 Paste HF Model ID…</Option>
          {dynamicModelId && (
            <Option value={dynamicModelId}>✨ {dynamicModelId}</Option>
          )}
        </Select>

        {showAdapter && (
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

        {/* Badge-like hint for dynamic */}
        {!isStatic && (
          <Typography level="body-sm" sx={{ ml: 1, opacity: 0.8 }}>
            (Dynamic MLX)
          </Typography>
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
            disabled={!ragEnabled || tabIndex !== 0}
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

      {/* Paste HF ID Modal */}
      <Modal open={pasteOpen} onClose={() => { if (!pasteLoading) setPasteOpen(false); }}>
        <ModalDialog sx={{ minWidth: 520 }}>
          <ModalClose disabled={pasteLoading} />
          <DialogTitle>Load a Hugging Face model (MLX)</DialogTitle>
          <DialogContent>
            <Stack spacing={1.5}>
              <Typography level="body-sm">
                Paste a Hugging Face model ID (e.g., <code>Qwen/Qwen2.5-1.5B-Instruct</code>). We’ll spin up a local MLX worker and route chat to it.
              </Typography>
              <Input
                ref={pasteInputRef}
                placeholder="owner/model-id"
                value={pasteId}
                onChange={(e) => setPasteId(e.target.value)}
                disabled={pasteLoading}
              />
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                <Button
                  variant="plain"
                  onClick={() => setPasteOpen(false)}
                  disabled={pasteLoading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={onConfirmPaste}
                  disabled={!pasteId.trim() || pasteLoading}
                >
                  {pasteLoading ? <><CircularProgress size="sm" /> Loading…</> : "Load"}
                </Button>
              </Box>
            </Stack>
          </DialogContent>
        </ModalDialog>
      </Modal>
    </Box>
  );
}
