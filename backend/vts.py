# vts.py
from __future__ import annotations
import io, os, base64, tempfile
from typing import Optional, List, Dict, Tuple

import numpy as np
import torch
import torch.nn as nn
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse

# Optional deps: torchaudio for pretrained CTC; librosa/soundfile for robust I/O
try:
    import torchaudio
    HAS_TORCHAUDIO = True
except Exception:
    HAS_TORCHAUDIO = False

# NEW: faster-whisper (robust text ASR)
try:
    from faster_whisper import WhisperModel
    HAS_WHISPER = True
except Exception:
    HAS_WHISPER = False

# NEW: G2P for phonemes from recognized text
try:
    from g2p_en import G2p
    HAS_G2P = True
    _g2p = G2p()
except Exception:
    HAS_G2P = False
    _g2p = None


try:
    import soundfile as sf
except Exception:
    sf = None

try:
    import librosa
except Exception:
    librosa = None

# ----------------------------
# Phoneme inventory (TIMIT 39 + blank at 0)
# ----------------------------
PHONEMES_39 = [
    # 0 is reserved for CTC blank
    "_", "aa","ae","ah","ao","aw","ax","ay","b","ch","d","dh","dx","eh","el","en",
    "er","ey","f","g","hh","ih","iy","jh","k","l","m","n","ng","ow","oy","p",
    "r","s","sh","t","th","uh","uw","v","w","y","z","zh"
]
# Keep only 39+blank (43 total here to cover zh etc.); map unknowns onto nearest or drop in decoding
PHONEME_TO_ID = {p:i for i,p in enumerate(PHONEMES_39)}
ID_TO_PHONEME = {i:p for p,i in PHONEME_TO_ID.items()}


def asr_text_with_whisper(
    wav: np.ndarray,
    sr: int,
    model_size: str = "small",
    language: Optional[str] = None,
) -> Tuple[str, List[Dict], Optional[str]]:
    """
    Use faster-whisper to produce coherent text with punctuation and timestamps.
    Returns: (full_text, segments=[{text,start,end}], detected_language)
    """
    if not HAS_WHISPER:
        raise HTTPException(status_code=500, detail="faster-whisper not installed.")
    if sf is None:
        raise HTTPException(status_code=500, detail="soundfile is required for whisper backend.")

    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as tmp:
        # Reuse your loader’s normalization; write a clean 16k mono wav for Whisper
        sf.write(tmp.name, wav, sr)
        model = WhisperModel(model_size, device="auto", compute_type="auto")

        segments, info = model.transcribe(tmp.name, language=language)
        pieces, seg_meta = [], []
        for seg in segments:
            txt = (seg.text or "").strip()
            if txt:
                pieces.append(txt)
                seg_meta.append({"text": txt, "start": float(seg.start or 0.0), "end": float(seg.end or 0.0)})

        full_text = " ".join(pieces).strip()
        detected = getattr(info, "language", None)
        return full_text, seg_meta, detected



# ----------------------------
# Feature extraction: MFCC(12) + log-energy + delta => 26 dims @ 10ms hop
# ----------------------------
def load_audio_to_mono_16k(data: bytes) -> Tuple[np.ndarray, int]:
    """Decode common formats to mono 16k float32."""
    if sf is not None:
        with io.BytesIO(data) as bio:
            wav, sr = sf.read(bio, always_2d=False, dtype="float32")
        if wav.ndim > 1:
            wav = np.mean(wav, axis=1)
    elif librosa is not None:
        with tempfile.NamedTemporaryFile(suffix=".tmp", delete=True) as tmp:
            tmp.write(data); tmp.flush()
            wav, sr = librosa.load(tmp.name, sr=None, mono=True)
    else:
        raise HTTPException(status_code=500, detail="Missing audio decoders (install soundfile or librosa).")

    if sr != 16000:
        if librosa is None:
            raise HTTPException(status_code=500, detail="Need librosa to resample to 16k.")
        wav = librosa.resample(wav, orig_sr=sr, target_sr=16000)
        sr = 16000
    return wav.astype(np.float32), sr

def mfcc26_10ms(wav: np.ndarray, sr: int = 16000) -> np.ndarray:
    """12 MFCC + log-energy + delta of all (13) => 26 dims; 25ms win, 10ms hop."""
    if librosa is None:
        raise HTTPException(status_code=500, detail="librosa required for MFCC features.")
    win_length = int(0.025 * sr)
    hop_length = int(0.010 * sr)
    # 12 MFCC + log-energy
    mfcc = librosa.feature.mfcc(y=wav, sr=sr, n_mfcc=12, n_fft=1024, hop_length=hop_length, win_length=win_length)
    # log-energy as RMS^2
    rmse = librosa.feature.rms(y=wav, frame_length=win_length, hop_length=hop_length)[0]
    loge = np.log(np.maximum(rmse, 1e-10)).reshape(1, -1)
    base = np.vstack([mfcc, loge])  # (13, T)
    delta = librosa.feature.delta(base, order=1)     # (13, T)
    feats = np.vstack([base, delta]).T               # (T, 26)
    # mean-var norm
    mu, sigma = feats.mean(axis=0), feats.std(axis=0) + 1e-5
    feats = (feats - mu) / sigma
    return feats.astype(np.float32)

# ----------------------------
# Simple BiLSTM-CTC phoneme model
# ----------------------------
class BiLSTMCTC(nn.Module):
    def __init__(self, input_dim=26, hidden=256, layers=3, num_classes=len(PHONEMES_39)):
        super().__init__()
        self.lstm = nn.LSTM(input_dim, hidden, num_layers=layers, bidirectional=True, batch_first=True)
        self.fc = nn.Linear(2*hidden, num_classes)  # includes blank at 0
    def forward(self, x):  # x: (B,T,26)
        out, _ = self.lstm(x)
        logits = self.fc(out)  # (B,T,C)
        return logits

def greedy_ctc_decode(logits: torch.Tensor, blank_id: int = 0) -> List[int]:
    """Best-path decoding: argmax per frame, collapse repeats, drop blanks."""
    # logits: (T, C)
    pred = torch.argmax(logits, dim=-1).tolist()
    out = []
    prev = None
    for p in pred:
        if p != blank_id and p != prev:
            out.append(p)
        prev = p
    return out

def time_stamps_from_frames(num_frames: int, hop_sec: float = 0.010, win_sec: float = 0.025) -> List[Tuple[float,float]]:
    """Approximate per-frame [start,end) assuming 10ms hop."""
    spans = []
    for i in range(num_frames):
        start = i * hop_sec
        end = start + win_sec
        spans.append((start, end))
    return spans

def maybe_load_custom_weights(model: nn.Module) -> str:
    """Load weights if present; otherwise run with random (for structure/CI)."""
    # ENV or default path
    cand = os.environ.get("PHONEME_CTC_WEIGHTS", "models/phoneme_ctc.pt")
    if os.path.exists(cand):
        state = torch.load(cand, map_location="cpu")
        # support state under "model" or direct
        if isinstance(state, dict) and "state_dict" in state:
            model.load_state_dict(state["state_dict"])
        else:
            model.load_state_dict(state)
        return f"loaded:{cand}"
    return "missing"

# ----------------------------
# Pretrained CTC ASR backend (if available)
# ----------------------------
def asr_text_with_torchaudio(wav: np.ndarray, sr: int) -> Tuple[str, List[Tuple[int,float,float]]]:
    """
    Use wav2vec2.0 CTC (torchaudio bundle) for text.
    Returns (text, char_timestamps).
    """
    if not HAS_TORCHAUDIO:
        raise HTTPException(status_code=500, detail="torchaudio not available for pretrained CTC.")
    bundle = torchaudio.pipelines.WAV2VEC2_ASR_BASE_960H
    model = bundle.get_model()
    with torch.inference_mode():
        waveform = torch.from_numpy(wav).unsqueeze(0)  # (1,T)
        if sr != bundle.sample_rate:
            waveform = torchaudio.functional.resample(waveform, sr, bundle.sample_rate)
        emissions, _ = model(waveform)  # (1, T', C)
        emissions = emissions[0].cpu()  # (T', C)

        # Greedy CTC decode into label indices
        labels = torch.argmax(emissions, dim=-1).tolist()
        # Collapse + map to tokens
        tokens = []
        prev = None
        for l in labels:
            if l != prev:
                tokens.append(l)
            prev = l
        dictionary = bundle.get_labels()
        # drop CTC blank at index 0 in this bundle
        text = "".join([dictionary[t] for t in tokens if dictionary[t] != "|"]).replace("▁", " ").strip()
        # Rough timestamps per frame
        hop_sec = (len(wav)/bundle.sample_rate) / emissions.shape[0]
        char_spans = [(idx, i*hop_sec, (i+1)*hop_sec) for i, idx in enumerate(tokens)]
        return text, char_spans

# ----------------------------
# FastAPI Router
# ----------------------------
vts_router = APIRouter()


@vts_router.post("/vts_whisper")
async def vts_whisper(
    audio: Optional[UploadFile] = File(default=None, description="Audio file (wav/mp3/m4a/etc.)"),
    audio_b64: Optional[str] = Form(default=None, description="Base64-encoded audio"),
    whisper_model: str = Form(default="small"),
    whisper_language: Optional[str] = Form(default=None),
):
    """
    Lightweight endpoint to return full transcription text using faster-whisper.
    Does not compute phonemes here (those remain in /generate/vtt).
    """
    # Load audio bytes (same pattern as your /generate/vtt)
    if audio is not None:
        data = await audio.read()
    elif audio_b64 is not None:
        import base64
        try:
            data = base64.b64decode(audio_b64)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid base64 audio.")
    else:
        raise HTTPException(status_code=400, detail="Provide 'audio' file or 'audio_b64'.")

    # Convert to mono 16k and run Whisper
    wav, sr = load_audio_to_mono_16k(data)
    text, segments, detected_lang = asr_text_with_whisper(
        wav, sr, model_size=whisper_model, language=whisper_language
    )

    return JSONResponse({
        "text": text,
        "segments": segments,          # optional for your UI; safe to keep
        "model": whisper_model,
        "language": whisper_language or detected_lang,
        "sampling_rate": sr,
        "duration_sec": float(len(wav) / sr),
    })



@vts_router.post("/generate/vtt")
async def voice_to_text(
    audio: Optional[UploadFile] = File(default=None, description="Audio file (wav/mp3/m4a/etc.)"),
    audio_b64: Optional[str] = Form(default=None, description="Base64-encoded audio"),
    backend: str = Form(default="auto", description="auto | torchaudio_w2v2 | ctc_bilstm"),
    return_phonemes: bool = Form(default=True),
):
    """
    Convert speech → text (and phonemes).

    Backends:
      - auto: prefer torchaudio wav2vec2 CTC if present; else fallback to BiLSTM-CTC phoneme model
      - torchaudio_w2v2: pretrained English ASR (CTC) → text
      - - ctc_bilstm: MFCC→BLSTM→CTC phoneme decoder (inference-only; random weights unless you later add trained weights)
    """
    # Load audio bytes
    if audio is not None:
        data = await audio.read()
    elif audio_b64 is not None:
        try:
            data = base64.b64decode(audio_b64)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid base64 audio.")
    else:
        raise HTTPException(status_code=400, detail="Provide 'audio' file or 'audio_b64'.")

    wav, sr = load_audio_to_mono_16k(data)
    duration = float(len(wav) / sr)

    chosen = backend
    text_out: Optional[str] = None
    phonemes_out: Optional[List[str]] = None
    phoneme_spans: Optional[List[Dict]] = None
    weights_status = None

    if backend == "auto":
        chosen = "torchaudio_w2v2" if HAS_TORCHAUDIO else "ctc_bilstm"

    if chosen == "torchaudio_w2v2":
        text_out, char_spans = asr_text_with_torchaudio(wav, sr)
        # Replace placeholder phoneme logic with g2p-en for clean phonemes
        if return_phonemes and text_out:
            try:
                from g2p_en import G2p
                g2p = G2p()
                # g2p returns a mix of phones and spaces; filter spaces
                phonemes_out = [p for p in g2p(text_out) if p != ' ']
            except Exception:
                pass        
        # Optional phonemization: approximate (post-ASR) for display
        if return_phonemes:
            try:
                # Light, deterministic fallback: break into rough phoneme-like units by naive rules
                # (You can swap with a real G2P later.)
                phonemes_out = [c for c in text_out.lower() if c.isalpha()]
            except Exception:
                phonemes_out = None

    elif chosen == "ctc_bilstm":
        feats = mfcc26_10ms(wav, sr)         # (T,26)
        T = feats.shape[0]
        framespans = time_stamps_from_frames(T, hop_sec=0.010, win_sec=0.025)
        x = torch.from_numpy(feats).unsqueeze(0)  # (1,T,26)
        model = BiLSTMCTC(input_dim=26, hidden=256, layers=3, num_classes=len(PHONEMES_39))
        weights_status = maybe_load_custom_weights(model)
        model.eval()
        with torch.inference_mode():
            logits = model(x)[0]             # (T,C)
            # softmax for readability; greedy decode for sequence
            probs = torch.log_softmax(logits, dim=-1).exp()
            ids = greedy_ctc_decode(logits, blank_id=0)
            phonemes_out = [ID_TO_PHONEME.get(i, "?") for i in ids]
            # timestamps per kept token: choose first occurrence frame; simple heuristic
            kept_spans = []
            idx_iter = 0
            prev = None
            for t in range(T):
                j = int(torch.argmax(logits[t]).item())
                if j != 0 and j != prev:
                    kept_spans.append(framespans[t])
                prev = j
            phoneme_spans = [
                {"phoneme": ph, "start": float(s), "end": float(e)}
                for ph, (s, e) in zip(phonemes_out, kept_spans)
            ]
            # Text is nontrivial without a lexicon + LM; omit here
            text_out = None
    else:
        raise HTTPException(status_code=400, detail="backend must be one of: auto|torchaudio_w2v2|ctc_bilstm")

    return JSONResponse({
        "backend_used": chosen,
        "sampling_rate": sr,
        "duration_sec": duration,
        "text": text_out,
        "phonemes": phonemes_out,
        "phoneme_spans": phoneme_spans,
        "weights": weights_status or "n/a"
    })
