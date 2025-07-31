import { useState, useRef } from 'react';
import { Box, Button, Textarea, Typography, CircularProgress, Stack, IconButton } from '@mui/joy';
import { generateDiffusionImage } from '../lib/api';
import { XIcon, Paperclip } from 'lucide-react';

export default function DiffusionPage() {
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null); // result
  const [attachedImage, setAttachedImage] = useState<string | null>(null); // input
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);

    try {
      const result = await generateDiffusionImage(prompt, attachedImage);
      setImageUrl(result);
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

  const handleImageUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          setAttachedImage(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    };

    input.click();
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

        <Button onClick={handleSave} disabled={!imageUrl} color="neutral" variant="outlined">
          Save Image
        </Button>

        <IconButton onClick={handleImageUpload} variant="outlined" color="neutral" title="Attach Image">
          <Paperclip />
        </IconButton>
      </Stack>

      {attachedImage && (
        <Box sx={{ position: 'relative', width: '200px' }}>
          <Box
            component="img"
            src={attachedImage}
            alt="Attached"
            sx={{ width: '100%', borderRadius: 6, mt: 1 }}
          />
          <IconButton
            size="sm"
            onClick={() => setAttachedImage(null)}
            sx={{
              position: 'absolute',
              top: 4,
              right: 4,
              backgroundColor: 'rgba(0,0,0,0.6)',
              color: 'white',
            }}
          >
            <XIcon size="16px" />
          </IconButton>
        </Box>
      )}

      {imageUrl && (
        <Box component="img" src={imageUrl} alt="Generated" sx={{ maxWidth: '100%', mt: 3 }} />
      )}
    </Box>
  );
}
