from sentence_transformers import SentenceTransformer
import torch

_model = None

def get_embedder(name: str = "sentence-transformers/all-MiniLM-L6-v2"):
    global _model
    if _model is None:
        device = "mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu")
        _model = SentenceTransformer(name, device=device)
    return _model

def embed_texts(texts):
    model = get_embedder()
    # normalize => cosine via inner product in FAISS
    return model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
