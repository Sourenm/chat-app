// TTSPage.tsx
import { useState } from 'react';
import {
  Box,
  Button,
  Textarea,
  Typography,
  CircularProgress,
  Stack
} from '@mui/joy';
import { generateTTS } from '../lib/api';

export default function TTSPage() {
  const [text, setText] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerateTTS = async () => {
    if (!text.trim()) return;

    setIsLoading(true);
    try {
      const blobUrl = await generateTTS(text);
      setAudioUrl(blobUrl);
    } catch (err: any) {
      console.error('❌ TTS generation failed:', err);
      alert(`TTS failed: ${err.message}`);
    }
    setIsLoading(false);
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = 'tts_output.wav';
    link.click();
  };

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography level="h4">Text to Speech</Typography>

      <Textarea
        minRows={3}
        placeholder="Enter text to synthesize..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <Stack direction="row" spacing={2}>
        <Button onClick={handleGenerateTTS} disabled={isLoading || !text.trim()}>
          {isLoading ? <CircularProgress size="sm" /> : 'Generate'}
        </Button>

        <Button onClick={handleDownload} disabled={!audioUrl} variant="outlined">
          Download
        </Button>
      </Stack>

      {audioUrl && (
        <Box>
          <audio controls src={audioUrl} style={{ marginTop: '1rem' }} />
        </Box>
      )}
    </Box>
  );
}
