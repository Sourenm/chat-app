import os
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, Form, Query, HTTPException
from pydantic import BaseModel
from rag.loaders import load_any
from rag.chunker import chunk_doc
from rag.embeddings import embed_texts
from rag.store_faiss import FaissStore
from rag.pipeline import answer_with_rag
from pathlib import Path

router = APIRouter(prefix="/rag", tags=["rag"])

class RagQueryBody(BaseModel):
    index_name: str
    query: str
    top_k: int = 5
    use_reranker: bool = False

@router.post("/index")
async def rag_index(
    files: List[UploadFile] = File(...),
    index_name: str = Form("default"),
    chunk_size: int = Form(850),
    chunk_overlap: int = Form(120),
):
    os.makedirs("uploads", exist_ok=True)
    saved_paths = []
    for f in files:
        path = os.path.join("uploads", f.filename)
        with open(path, "wb") as out:
            out.write(await f.read())
        saved_paths.append(path)

    all_chunks = []
    doc_ids = set()
    for path in saved_paths:
        for doc in load_any(path):
            doc_ids.add(doc.doc_id)
            chunks = chunk_doc(doc, chunk_tokens=chunk_size, overlap=chunk_overlap)
            all_chunks.extend(chunks)

    texts = [c.text for c in all_chunks]
    if len(texts) == 0:
        raise HTTPException(status_code=400, detail="No text content found in uploaded files.")

    vecs = embed_texts(texts)
    store = FaissStore(name=index_name)
    store.load(dim=vecs.shape[1])
    store.add(vecs, all_chunks)

    return {
        "index": index_name,
        "indexed_files": [os.path.basename(p) for p in saved_paths],
        "doc_ids": list(doc_ids),
        "chunks": len(all_chunks),
        "size": store.size(),
    }

@router.post("/query")
async def rag_query(body: RagQueryBody):
    result = await answer_with_rag(
        query=body.query,
        index_name=body.index_name,
        top_k=body.top_k
    )
    return result

@router.get("/indexes")
async def rag_indexes():
    import glob
    idx = []
    for ipath in glob.glob("indices/*.faiss"):
        name = os.path.splitext(os.path.basename(ipath))[0]
        store = FaissStore(name=name)
        store.load(dim=384)
        idx.append({"index_name": name, "size": store.size()})
    return {"indexes": idx}

@router.delete("/document/{doc_id}")
async def rag_delete_document(doc_id: str, index_name: str = Query("default")):
    store = FaissStore(name=index_name)
    store.load(dim=384)
    before = store.size()
    store.delete_doc(doc_id)
    after = store.size()
    return {"index": index_name, "doc_id": doc_id, "before": before, "after": after}


@router.delete("/index/{index_name}")
async def rag_delete_index(index_name: str):
    """
    Deletes the FAISS index + metadata JSON for this index,
    and any uploaded source files referenced in that metadata
    (ONLY if they live under the local 'uploads/' dir).
    """
    uploads_dir = Path("uploads").resolve()
    indices_dir = Path("indices").resolve()

    index_path = indices_dir / f"{index_name}.faiss"
    meta_path  = indices_dir / f"{index_name}.meta.json"

    if not index_path.exists() and not meta_path.exists():
        raise HTTPException(status_code=404, detail=f"Index '{index_name}' not found.")

    # Collect source file paths from metadata (if present)
    source_files: Set[Path] = set()
    if meta_path.exists():
        import json
        try:
            meta = json.load(open(meta_path, "r"))
            for m in meta:
                p = m.get("metadata", {}).get("path")
                if not p:
                    continue
                candidate = Path(p).resolve()
                # Safety: only delete files inside uploads/
                if str(candidate).startswith(str(uploads_dir) + os.sep) or candidate == uploads_dir:
                    source_files.add(candidate)
        except Exception:
            # If metadata is unreadable, skip file deletion but still delete index artifacts
            source_files = set()

    # Delete index artifacts
    deleted = {"index": False, "meta": False, "uploads": []}
    if index_path.exists():
        index_path.unlink()
        deleted["index"] = True
    if meta_path.exists():
        meta_path.unlink()
        deleted["meta"] = True

    # Delete uploaded files (best-effort)
    for f in source_files:
        try:
            if f.exists():
                f.unlink()
                deleted["uploads"].append(str(f))
        except Exception:
            # ignore failures per-file
            pass

    return {
        "index_name": index_name,
        "deleted_index_file": deleted["index"],
        "deleted_meta_file": deleted["meta"],
        "deleted_uploads": deleted["uploads"],
    }