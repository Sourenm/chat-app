// VTS.tsx
import { useEffect, useRef, useState } from 'react';
import {
  Box, Button, Typography, Stack, Chip, Sheet, Input, Select, Option, CircularProgress
} from '@mui/joy';
import { generateVTTFile, generateVTSWhisperFile} from '../lib/api';

type VttResponse = {
  backend_used: string;
  sampling_rate: number;
  duration_sec: number;
  text: string | null;
  phonemes: string[] | null;
  phoneme_spans: { phoneme: string; start: number; end: number; }[] | null;
  weights: string;
};

const cleanTranscribedText = (s: string | null | undefined) =>
(s ?? '')
    .replace(/--/g, ' ')  // turn double hyphen into a space
    .replace(/-/g, '');   // remove single hyphens

// ---- Simple WAV encoder (mono, 16k, 16-bit) for in-app recordings
function encodeWavPCM16Mono(samples: Float32Array, sampleRate = 16000): Blob {
  // clamp & convert
  const pcm16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  // WAV header
  const buffer = new ArrayBuffer(44 + pcm16.byteLength);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + pcm16.byteLength, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);          // PCM header size
  view.setUint16(20, 1, true);           // PCM
  view.setUint16(22, 1, true);           // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate (16-bit mono)
  view.setUint16(32, 2, true);           // block align
  view.setUint16(34, 16, true);          // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, pcm16.byteLength, true);
  // data
  new Uint8Array(buffer, 44).set(new Uint8Array(pcm16.buffer));
  return new Blob([buffer], { type: 'audio/wav' });
}

export default function VTS() {
  const [backend, setBackend] = useState<'auto' | 'torchaudio_w2v2' | 'ctc_bilstm'>('auto');
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [resp, setResp] = useState<VttResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [respWhisper, setRespWhisper] = useState<{ text: string | null } | null>(null);
  const [loadingWhisper, setLoadingWhisper] = useState(false);


  // Recording state
  const [recState, setRecState] = useState<'idle' | 'recording' | 'finalizing'>('idle');
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<Float32Array[]>([]);
  const targetSR = 16000;

  useEffect(() => {
    return () => {
      if (audioCtxRef.current) audioCtxRef.current.close();
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const handlePickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setPickedFile(f);
    setAudioUrl(f ? URL.createObjectURL(f) : null);
    setResp(null);
  };

  async function startRecording() {
    setResp(null);
    buffersRef.current = [];
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = proc;

    src.connect(proc);
    proc.connect(ctx.destination);

    const inputSR = ctx.sampleRate; // e.g., 48000
    proc.onaudioprocess = (ev) => {
      const input = ev.inputBuffer.getChannelData(0);
      // Resample to 16k quickly (linear)
      const ratio = inputSR / targetSR;
      const outLen = Math.round(input.length / ratio);
      const out = new Float32Array(outLen);
      for (let i = 0; i < outLen; i++) {
        const idx = i * ratio;
        const i0 = Math.floor(idx);
        const i1 = Math.min(i0 + 1, input.length - 1);
        const w = idx - i0;
        out[i] = input[i0] * (1 - w) + input[i1] * w;
      }
      buffersRef.current.push(out);
    };

    setRecState('recording');
  }

  function stopRecording() {
    if (!processorRef.current || !audioCtxRef.current) return;
    setRecState('finalizing');
    processorRef.current.disconnect();
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    audioCtxRef.current.close();

    const total = buffersRef.current.reduce((s, a) => s + a.length, 0);
    const merged = new Float32Array(total);
    let off = 0;
    for (const b of buffersRef.current) { merged.set(b, off); off += b.length; }
    const wavBlob = encodeWavPCM16Mono(merged, targetSR);
    const file = new File([wavBlob], 'recording.wav', { type: 'audio/wav' });
    setPickedFile(file);
    setAudioUrl(URL.createObjectURL(file));
    setRecState('idle');
  }

  async function submit() {
    if (!pickedFile) return;
    setLoading(true);
    setLoadingWhisper(true);
    try {
      const [out, outWhisper] = await Promise.all([
      generateVTTFile(pickedFile, backend, true),
      generateVTSWhisperFile(pickedFile, 'small'), // adjust model/lang if needed
      ]);
      setResp(out);
      setRespWhisper(outWhisper);
    } catch (e: any) {
      alert(e?.message || 'Voice-to-text failed.');
    } finally {
      setLoading(false);
      setLoadingWhisper(false);
    }
  }


  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography level="h4">Voice to Text</Typography>

      <Stack direction="row" spacing={2} alignItems="center">
        <Select value={backend} onChange={(_, v) => v && setBackend(v)} sx={{ minWidth: 240 }}>
          <Option value="auto">auto (prefer wav2vec2)</Option>
          <Option value="torchaudio_w2v2">torchaudio_w2v2</Option>
          <Option value="ctc_bilstm">ctc_bilstm (phonemes)</Option>
        </Select>

        <Input
          type="file"
          accept="audio/*,.wav,.mp3,.m4a"
          onChange={handlePickFile}
          slotProps={{ input: { 'aria-label': 'Upload audio file' } }}
        />

        {recState !== 'recording' ? (
          <Button onClick={startRecording} variant="outlined">🎙️ Record</Button>
        ) : (
          <Button onClick={stopRecording} color="danger">⏹ Stop</Button>
        )}

        <Button onClick={submit} disabled={!pickedFile || loading}>
          {loading ? <CircularProgress size="sm" /> : 'Transcribe'}
        </Button>
      </Stack>

      {audioUrl && (
        <Sheet variant="soft" sx={{ p: 2 }}>
          <audio controls src={audioUrl} />
        </Sheet>
      )}

      {resp && (
        <Sheet variant="outlined" sx={{ p: 2 }}>
          <Typography level="body-sm" sx={{ opacity: 0.8 }}>
            Backend: <b>{resp.backend_used}</b> | SR: {resp.sampling_rate} | Duration: {resp.duration_sec.toFixed(2)}s
          </Typography>

          <Box sx={{ mt: 1 }}>
            <Typography level="h5">Text</Typography>
            <Typography sx={{ whiteSpace: 'pre-wrap' }}>{resp.text || '—'}</Typography>
          </Box>

          {resp.phonemes && resp.phonemes.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography level="h5">Phonemes</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {resp.phonemes.map((p, i) => <Chip key={i} size="sm">{p}</Chip>)}
              </Stack>
            </Box>
          )}

          {resp.phoneme_spans && resp.phoneme_spans.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography level="h5">Timestamps</Typography>
              <Stack spacing={0.5}>
                {resp.phoneme_spans.map((s, i) => (
                  <Typography key={i} level="body-sm">
                    {s.phoneme}: {s.start.toFixed(3)} → {s.end.toFixed(3)} sec
                  </Typography>
                ))}
              </Stack>
            </Box>
          )}
        </Sheet>
      )}
      {respWhisper && (
      <Sheet variant="outlined" sx={{ p: 2 }}>
          <Typography level="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          Whisper (Full Text)
          {loadingWhisper && <CircularProgress size="sm" />}
          </Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>
          {cleanTranscribedText(respWhisper.text) || '—'}
          </Typography>
      </Sheet>
      )}

    </Box>
  );
}
