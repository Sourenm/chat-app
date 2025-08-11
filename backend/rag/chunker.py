from typing import List
from transformers import AutoTokenizer
from .schema import Doc, Chunk
import hashlib

TOKENIZER = AutoTokenizer.from_pretrained("meta-llama/Llama-3.2-1B-Instruct")

def _hash(s: str) -> str:
    return hashlib.md5(s.encode("utf-8")).hexdigest()[:16]

def chunk_doc(doc: Doc, chunk_tokens=850, overlap=120) -> List[Chunk]:
    ids = TOKENIZER(doc.text, add_special_tokens=False)["input_ids"]
    chunks: List[Chunk] = []
    start = 0
    while start < len(ids):
        end = min(start + chunk_tokens, len(ids))
        text = TOKENIZER.decode(ids[start:end])
        cid = f"{doc.doc_id}:{_hash(f'{start}-{end}')}"
        meta = dict(doc.metadata) if doc.metadata else {}
        meta.update({"source": doc.source, "start_tok": str(start), "end_tok": str(end)})
        chunks.append(Chunk(chunk_id=cid, doc_id=doc.doc_id, text=text, metadata=meta))
        if end == len(ids): break
        start = max(0, end - overlap)
    return chunks
