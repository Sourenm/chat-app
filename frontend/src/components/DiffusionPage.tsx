import { useState, useRef } from 'react';
import { Box, Button, Textarea, Typography, CircularProgress, Stack } from '@mui/joy';
import { generateDiffusionImage } from '../lib/api';

export default function DiffusionPage() {
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const downloadLinkRef = useRef<HTMLAnchorElement | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);

    try {
      const imageUrl = await generateDiffusionImage(prompt);
      setImageUrl(imageUrl);
    } catch (err) {
      console.error("❌ Diffusion failed:", err);
      alert(`Generation failed: ${err.message}`);
    }

    setIsLoading(false);
  };

  const handleSave = () => {
    if (!imageUrl) return;

    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = 'generated_image.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography level="h4">Image Diffusion</Typography>
      <Textarea
        minRows={3}
        placeholder="Describe the image you'd like to generate..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />

      <Stack direction="row" spacing={2}>
        <Button onClick={handleGenerate} disabled={isLoading || !prompt.trim()}>
          {isLoading ? <CircularProgress size="sm" /> : 'Generate'}
        </Button>

        <Button
          onClick={handleSave}
          disabled={!imageUrl}
          color="neutral"
          variant="outlined"
        >
          Save Image
        </Button>
      </Stack>

      {imageUrl && (
        <Box component="img" src={imageUrl} alt="Generated" sx={{ maxWidth: '100%', mt: 2 }} />
      )}
    </Box>
  );
}
