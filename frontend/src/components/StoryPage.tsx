// StoryPage.tsx
import { useEffect, useRef, useState } from 'react';
import {
  Box, Button, Textarea, Typography, Stack, Input, Select, Option,
  Sheet, CircularProgress, IconButton, Tooltip
} from '@mui/joy';
import { orchestrateStory, getDatasets, ragGetIndexes } from '../lib/api';
import { Paperclip, XIcon, RefreshCcw } from 'lucide-react';

export default function StoryPage() {
  // Inputs
  const [narrative, setNarrative] = useState('');
  const [image, setImage] = useState<string | null>(null);

  // KB controls (reuse your Knowledge patterns)
  const [useKB, setUseKB] = useState(true);
  const [ragIndexName, setRagIndexName] = useState<string>('default');
  const [indexes, setIndexes] = useState<{ index_name: string; size: number }[]>([]);

  // Fine-tune (optional)
  const [useFinetune, setUseFinetune] = useState(false);
  const [datasets, setDatasets] = useState<string[]>([]);
  const [finetuneDataset, setFinetuneDataset] = useState<string | null>(null);
  const [adapterName, setAdapterName] = useState<string>('');
  const [epochs, setEpochs] = useState(3);
  const [lr, setLr] = useState(2e-4);
  const [r, setR] = useState(8);
  const [alpha, setAlpha] = useState(16);
  const [dropout, setDropout] = useState(0.05);

  // Illustration controls
  const [numIllustrations, setNumIllustrations] = useState(2);
  const [styleHint, setStyleHint] = useState('cinematic, cohesive color palette, soft light');

  // Results
  const [isRunning, setIsRunning] = useState(false);
  const [sceneSummary, setSceneSummary] = useState('');
  const [storyText, setStoryText] = useState('');
  const [illustrations, setIllustrations] = useState<string[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const refreshIndexes = async () => setIndexes(await ragGetIndexes());

  useEffect(() => {
    refreshIndexes();
    getDatasets().then(setDatasets);
  }, []);

  const handleAttachImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => setImage(reader.result as string);
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleRun = async () => {
    if (!narrative.trim()) {
      alert('Please describe your narrative style/goal.');
      return;
    }
    setIsRunning(true);
    setSceneSummary('');
    setStoryText('');
    setIllustrations([]);
    setAudioUrl(null);

    try {
      const result = await orchestrateStory({
        narrative,
        image,
        rag_index_name: useKB ? ragIndexName : null,
        build_index: false,
        finetune: useFinetune,
        finetune_dataset: useFinetune ? finetuneDataset || undefined : undefined,
        adapter_name: useFinetune && adapterName.trim() ? adapterName.trim() : undefined,
        num_epochs: epochs,
        learning_rate: lr,
        lora_r: r,
        lora_alpha: alpha,
        lora_dropout: dropout,
        num_illustrations: numIllustrations,
        illustration_prompt_hint: styleHint || undefined,
      });

      setSceneSummary(result.scene_summary);
      setStoryText(result.story_text);
      setIllustrations(result.illustrationBlobUrls);
      setAudioUrl(result.audioBlobUrl || null);
    } catch (err: any) {
      console.error('❌ Orchestration failed:', err);
      alert(`Story orchestration failed: ${err.message}`);
    }
    setIsRunning(false);
  };

  return (
    <Sheet variant="soft" sx={{ p: 2, height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography level="h4">AI Multimedia Story</Typography>

      {/* Inputs */}
      <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 320 }}>
          <Typography level="title-sm">Narrative Guidance</Typography>
          <Textarea
            minRows={4}
            placeholder="e.g., First-person wistful tone, focus on smell of rain and warm window light."
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
          />
        </Box>

        <Box sx={{ minWidth: 280 }}>
          <Typography level="title-sm">Reference Image (optional)</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="outlined" onClick={handleAttachImage} startDecorator={<Paperclip size={16} />}>
              Attach
            </Button>
            <Button variant="plain" color="neutral" onClick={() => setImage(null)} disabled={!image}>
              Remove
            </Button>
          </Stack>
          {image && (
            <Box component="img" src={image} alt="ref" sx={{ width: 220, borderRadius: 6, mt: 1 }} />
          )}
        </Box>

        <Box sx={{ minWidth: 260 }}>
          <Typography level="title-sm">Illustrations</Typography>
          <Input
            type="number"
            value={numIllustrations}
            onChange={(e) => setNumIllustrations(Math.max(1, Number(e.target.value)))}
            slotProps={{ input: { min: 1 } }}
            sx={{ mb: 1 }}
          />
          <Input
            placeholder="Style hint"
            value={styleHint}
            onChange={(e) => setStyleHint(e.target.value)}
          />
        </Box>
      </Stack>

      {/* Knowledge Base */}
      <Sheet variant="outlined" sx={{ p: 1.5, borderRadius: 8 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
          <Typography level="title-sm">Knowledge Base</Typography>
          <Button size="sm" variant={useKB ? 'solid' : 'outlined'} onClick={() => setUseKB((v) => !v)}>
            {useKB ? 'Enabled' : 'Disabled'}
          </Button>
          <Select
            value={ragIndexName}
            onChange={(_, v) => v && setRagIndexName(v)}
            disabled={!useKB}
            sx={{ minWidth: 200 }}
          >
            {indexes.map((i) => (
              <Option key={i.index_name} value={i.index_name}>
                {i.index_name} ({i.size})
              </Option>
            ))}
          </Select>
          <Tooltip title="Refresh available indexes">
            <IconButton variant="plain" onClick={refreshIndexes}>
              <RefreshCcw size={16} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Sheet>

      {/* Fine-tune (optional) */}
      <Sheet variant="outlined" sx={{ p: 1.5, borderRadius: 8 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', gap: 12 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography level="title-sm">Fine-Tune LLaMA</Typography>
            <Button size="sm" variant={useFinetune ? 'solid' : 'outlined'} onClick={() => setUseFinetune((v) => !v)}>
              {useFinetune ? 'Enabled' : 'Disabled'}
            </Button>
          </Stack>

          <Select
            placeholder="Dataset"
            value={finetuneDataset || ''}
            onChange={(_, v) => setFinetuneDataset(v || null)}
            disabled={!useFinetune}
            sx={{ minWidth: 220 }}
          >
            {datasets.map((d) => (
              <Option key={d} value={d}>{d}</Option>
            ))}
          </Select>

          <Input
            placeholder="Adapter name (optional)"
            value={adapterName}
            onChange={(e) => setAdapterName(e.target.value)}
            disabled={!useFinetune}
            sx={{ minWidth: 220 }}
          />
        </Stack>

        <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
          <Input type="number" value={epochs} onChange={(e) => setEpochs(Number(e.target.value))} disabled={!useFinetune} placeholder="epochs" />
          <Input type="number" value={lr} onChange={(e) => setLr(Number(e.target.value))} disabled={!useFinetune} placeholder="lr" />
          <Input type="number" value={r} onChange={(e) => setR(Number(e.target.value))} disabled={!useFinetune} placeholder="LoRA r" />
          <Input type="number" value={alpha} onChange={(e) => setAlpha(Number(e.target.value))} disabled={!useFinetune} placeholder="alpha" />
          <Input type="number" value={dropout} onChange={(e) => setDropout(Number(e.target.value))} disabled={!useFinetune} placeholder="dropout" />
        </Stack>
      </Sheet>

      <Stack direction="row" spacing={2}>
        <Button onClick={handleRun} disabled={isRunning || !narrative.trim()}>
          {isRunning ? <CircularProgress size="sm" /> : 'Generate Story'}
        </Button>
      </Stack>

      {/* Results */}
      {(sceneSummary || storyText || illustrations.length || audioUrl) && (
        <Sheet variant="plain" sx={{ p: 2, borderRadius: 8 }}>
          {!!sceneSummary && (
            <>
              <Typography level="title-sm" sx={{ mb: 0.5 }}>Scene Summary</Typography>
              <Typography level="body-sm" sx={{ whiteSpace: 'pre-wrap' }}>{sceneSummary}</Typography>
            </>
          )}

          {!!storyText && (
            <>
              <Typography level="title-sm" sx={{ mt: 2, mb: 0.5 }}>Story</Typography>
              <Typography level="body-sm" sx={{ whiteSpace: 'pre-wrap' }}>{storyText}</Typography>
            </>
          )}

          {!!illustrations.length && (
            <>
              <Typography level="title-sm" sx={{ mt: 2, mb: 1 }}>Illustrations</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                {illustrations.map((u, i) => (
                  <Box key={i} component="img" src={u} alt={`Illustration ${i+1}`} sx={{ width: '100%', borderRadius: 8 }} />
                ))}
              </Box>
            </>
          )}

          {!!audioUrl && (
            <>
              <Typography level="title-sm" sx={{ mt: 2, mb: 0.5 }}>Narration</Typography>
              <audio controls src={audioUrl} />
            </>
          )}
        </Sheet>
      )}
    </Sheet>
  );
}
