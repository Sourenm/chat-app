// KnowledgePage.tsx
import { useEffect, useState, useRef } from 'react';
import {
  Box,
  Button,
  IconButton,
  Typography,
  Input,
  Sheet,
  Stack,
  CircularProgress,
} from '@mui/joy';
import { Trash2Icon } from 'lucide-react';

import { ragGetIndexes, ragIndex, ragDeleteIndex } from '../lib/api';

export default function KnowledgePage() {
  const [indexName, setIndexName] = useState('default');
  const [indexes, setIndexes] = useState<{ index_name: string; size: number }[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [isIndexing, setIsIndexing] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = async () => {
    const idx = await ragGetIndexes();
    setIndexes(idx);
  };

  useEffect(() => {
    refresh();
  }, []);

  const onPickFiles = () => fileRef.current?.click();

  const onIndex = async () => {
    if (!files.length) return;
    setIsIndexing(true);
    try {
      await ragIndex(indexName.trim() || 'default', files);
      setFiles([]);
      await refresh();
    } catch (e: any) {
      alert(`Indexing failed: ${e.message}`);
    } finally {
      setIsIndexing(false);
    }
  };

  const handleDeleteIndex = async (name: string) => {
    if (!confirm(`Delete index "${name}" and its uploaded files?`)) return;
    try {
      await ragDeleteIndex(name);
      await refresh();
    } catch (e: any) {
      alert(`Delete failed: ${e.message}`);
    }
  };

  return (
    <Sheet variant="soft" sx={{ p: 2, height: '100%', overflowY: 'auto' }}>
      <Typography level="h4" sx={{ mb: 2 }}>
        Knowledge Base
      </Typography>

      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
        <Typography level="body-sm">Index name</Typography>
        <Input
          value={indexName}
          onChange={(e) => setIndexName(e.target.value)}
          sx={{ maxWidth: 220 }}
        />
        <Button variant="outlined" onClick={onPickFiles}>
          Choose Files
        </Button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.csv,.txt,.md,.markdown"
          style={{ display: 'none' }}
          onChange={(e) => setFiles(Array.from(e.target.files || []))}
        />
        <Button onClick={onIndex} disabled={!files.length || isIndexing}>
          {isIndexing ? <CircularProgress size="sm" /> : 'Index Files'}
        </Button>
      </Stack>

      {!!files.length && (
        <Box sx={{ mb: 2 }}>
          <Typography level="body-sm">Selected files:</Typography>
          <ul style={{ marginTop: 6 }}>
            {files.map((f) => (
              <li key={f.name}>
                <Typography level="body-sm">{f.name}</Typography>
              </li>
            ))}
          </ul>
        </Box>
      )}

      <Typography level="title-sm" sx={{ mt: 2, mb: 1 }}>
        Existing Indexes
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8 }}>
        {indexes.map((it) => (
          <Box key={it.index_name} sx={{ display: 'contents', alignItems: 'center' }}>
            <Typography>{it.index_name}</Typography>
            <Typography level="body-sm">{it.size} chunks</Typography>
            <IconButton
              size="sm"
              color="danger"
              title="Delete entire index and its uploaded files"
              onClick={() => handleDeleteIndex(it.index_name)}
            >
              <Trash2Icon size="16px" />
            </IconButton>
          </Box>
        ))}
        {!indexes.length && <Typography level="body-sm">No indexes yet.</Typography>}
      </Box>
    </Sheet>
  );
}
