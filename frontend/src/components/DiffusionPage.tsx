// DiffusionPage.tsx
import { useState } from 'react';
import { Box, Button, Textarea, Typography, CircularProgress } from '@mui/joy';
import { generateDiffusionImage } from '../lib/api';

export default function DiffusionPage() {
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography level="h4">Image Diffusion</Typography>
      <Textarea
        minRows={3}
        placeholder="Describe the image you'd like to generate..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <Button onClick={handleGenerate} disabled={isLoading || !prompt.trim()}>
        {isLoading ? <CircularProgress size="sm" /> : 'Generate'}
      </Button>

      {imageUrl && (
        <Box component="img" src={imageUrl} alt="Generated" sx={{ maxWidth: '100%', mt: 2 }} />
      )}
    </Box>
  );
}
