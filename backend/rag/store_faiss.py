import os, json, faiss, numpy as np
from typing import List, Dict, Tuple
from .schema import Chunk
from .embeddings import embed_texts

class FaissStore:
    def __init__(self, root="indices", name="default"):
        os.makedirs(root, exist_ok=True)
        self.root = root
        self.name = name
        self.index_path = os.path.join(root, f"{name}.faiss")
        self.meta_path  = os.path.join(root, f"{name}.meta.json")
        self.index = None
        self.meta: List[Dict] = []
        self.dim: int = 384  # MiniLM default

    def load(self, dim: int = 384):
        self.dim = dim
        if os.path.exists(self.index_path):
            self.index = faiss.read_index(self.index_path)
            self.meta = json.load(open(self.meta_path, "r"))
        else:
            self.index = faiss.IndexFlatIP(dim)  # inner product (cosine if normalized)
            self.meta = []

    def persist(self):
        faiss.write_index(self.index, self.index_path)
        with open(self.meta_path, "w") as f:
            json.dump(self.meta, f)

    def add(self, embeddings: np.ndarray, chunks: List[Chunk]):
        if self.index is None:
            self.load(embeddings.shape[1])
        self.index.add(embeddings.astype("float32"))
        for c in chunks:
            self.meta.append({
                "chunk_id": c.chunk_id, "doc_id": c.doc_id,
                "text": c.text, "metadata": c.metadata
            })
        self.persist()

    def search(self, query_vec: np.ndarray, k=5) -> List[Tuple[float, Dict]]:
        D, I = self.index.search(query_vec.astype("float32"), k)
        out = []
        for score, idx in zip(D[0], I[0]):
            if idx == -1: continue
            m = self.meta[idx]
            out.append((float(score), m))
        return out

    def size(self) -> int:
        return self.index.ntotal if self.index is not None else 0

    def delete_doc(self, doc_id: str):
        # Rebuild index without that doc (simple & robust for local)
        remaining = [m for m in self.meta if m["doc_id"] != doc_id]
        texts = [m["text"] for m in remaining]
        if len(texts) == 0:
            # reset
            self.index = faiss.IndexFlatIP(self.dim)
            self.meta = []
            self.persist()
            return

        vecs = embed_texts(texts)
        self.index = faiss.IndexFlatIP(vecs.shape[1])
        self.index.add(np.array(vecs, dtype="float32"))
        self.meta = remaining
        self.persist()
