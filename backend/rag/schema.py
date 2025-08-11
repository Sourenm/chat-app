from pydantic import BaseModel
from typing import Dict

class Doc(BaseModel):
    doc_id: str
    source: str            # filename
    text: str
    metadata: Dict[str, str] = {}   # e.g., {"path": "...", "page": "3"}

class Chunk(BaseModel):
    chunk_id: str
    doc_id: str
    text: str
    metadata: Dict[str, str] = {}   # e.g., {"source": "...", "page": "3", "start_tok": "0", "end_tok": "850"}
