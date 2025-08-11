import os, hashlib
from typing import List
from pypdf import PdfReader
import pandas as pd
from .schema import Doc

def _make_id(s: str) -> str:
    return hashlib.md5(s.encode("utf-8")).hexdigest()[:16]

def load_pdf(path: str) -> List[Doc]:
    reader = PdfReader(path)
    docs: List[Doc] = []
    base = os.path.basename(path)
    for i, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        if text.strip():
            did = _make_id(f"{path}-{i}")
            docs.append(Doc(doc_id=did, source=base, text=text, metadata={"path": path, "page": str(i)}))
    return docs

def load_csv(path: str) -> List[Doc]:
    df = pd.read_csv(path)
    text = df.to_csv(index=False)
    did = _make_id(path)
    base = os.path.basename(path)
    return [Doc(doc_id=did, source=base, text=text, metadata={"path": path})]

def load_txt(path: str) -> List[Doc]:
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        text = f.read()
    did = _make_id(path)
    base = os.path.basename(path)
    return [Doc(doc_id=did, source=base, text=text, metadata={"path": path})]

def load_any(path: str) -> List[Doc]:
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf": return load_pdf(path)
    if ext == ".csv": return load_csv(path)
    if ext in (".md", ".markdown", ".txt"): return load_txt(path)
    # fallback
    return load_txt(path)
