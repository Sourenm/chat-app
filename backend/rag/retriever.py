import numpy as np
from typing import List, Dict
from .embeddings import embed_texts
from .store_faiss import FaissStore

def retrieve(index_name: str, query: str, top_k=5) -> List[Dict]:
    store = FaissStore(name=index_name)
    store.load(dim=384)
    qv = embed_texts([query])
    hits = store.search(np.array(qv), k=top_k)
    return [{"score": s, **m} for s, m in hits]
