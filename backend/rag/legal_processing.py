from pathlib import Path
import re
import hashlib
import datetime
from typing import List, Dict, Any, Tuple, Optional

# Use pypdf (already used in your project) to avoid new heavy dependencies.
from pypdf import PdfReader

# We'll reuse your existing Pydantic schema if available; otherwise define light fallbacks.
try:
    from .schema import Doc  # your project's defined Doc schema
except Exception:
    from pydantic import BaseModel
    class Doc(BaseModel):
        doc_id: str
        source: str
        text: str
        metadata: Dict[str, str] = {}

def _hash(s: str) -> str:
    return hashlib.md5(s.encode("utf-8")).hexdigest()[:16]

def _make_doc_id(path: str) -> str:
    return _hash(path)

class Node(dict):
    @property
    def id(self): return self.get("id")
    @property
    def text(self): return self.get("text","")
    @property
    def title(self): return self.get("title","")
    @property
    def label(self): return self.get("label","")

HEADING_RE = re.compile(r'^(Article|Section|Clause)\s+(\d+(?:\.\d+)*(?:\([a-z]\))*)', re.I)

def parse_pdf_to_nodes(path: str) -> Tuple[List[Dict[str, Any]], str]:
    reader = PdfReader(path)
    pages = []
    for p in reader.pages:
        txt = p.extract_text() or ""
        pages.append(txt)
    full_text = "\n".join(pages)

    nodes: List[Node] = []
    cur: Optional[Node] = None
    buf: List[str] = []

    def flush():
        nonlocal cur, buf, nodes
        if cur is not None:
            cur["text"] = "\n".join(buf).strip()
            nodes.append(cur)
            buf = []

    for raw_line in full_text.splitlines():
        line = raw_line.strip()
        m = HEADING_RE.match(line)
        if m:
            flush()
            kind = m.group(1).capitalize()
            num = m.group(2)
            label = f"{kind} {num}"
            cur = Node(id=f"§{num}", title=f"{kind} {num}", label=label, text="")
            buf = [line]
        else:
            if cur is None:
                cur = Node(id="§0", title="Preamble", label="Preamble", text="")
            buf.append(raw_line)
    flush()

    if not nodes:
        nodes = [Node(id="§0", title="Document", label="Document", text=full_text)]
    return nodes, full_text

XREF_RE = re.compile(r'\b(Article|Section|Clause)\s+(\d+(?:\.\d+)*(?:\([a-z]\))*)', re.I)
DEF_TERM_RE = re.compile(r'“([A-Z][A-Za-z ]+)”\s+(means|shall mean)\s+(.*)')
DATE_EXPR_RE = re.compile(
    r'\b(\d{1,3})\s+(business|calendar)?\s*day(s)?\s+(before|after|from)\s+(the\s+)?([A-Z][A-Za-z ]+ Date|Effective Date)\b',
    re.I
)

def build_label_index(nodes: List[Node]) -> Dict[str, str]:
    idx = {}
    for n in nodes:
        if n.label:
            idx[n.label] = n.id
        m = XREF_RE.search(n.text)
        if m:
            idx.setdefault(f"{m.group(1).capitalize()} {m.group(2)}", n.id)
    return idx

def detect_xrefs(nodes: List[Node], by_label: Dict[str,str]) -> Dict[str, List[Dict[str, Any]]]:
    refs: Dict[str, List[Dict[str, Any]]] = {}
    for n in nodes:
        for m in XREF_RE.finditer(n.text):
            label = f"{m.group(1).capitalize()} {m.group(2)}"
            refs.setdefault(n.id, []).append({
                "span": [m.start(), m.end()],
                "surface": m.group(0),
                "target_id": by_label.get(label)
            })
    return refs

def collect_definitions(nodes: List[Node]) -> Dict[str, Dict[str, Any]]:
    defs: Dict[str, Dict[str, Any]] = {}
    for n in nodes:
        for m in DEF_TERM_RE.finditer(n.text):
            term = m.group(1)
            defs[term] = {"node_id": n.id, "definition": m.group(3)}
    return defs

DATE_PHRASES = [
    r'\bmade and entered into (as of )?(?P<date>[A-Z][a-z]+ \d{1,2}, \d{4})\b',
    r'\bdated (as of )?(?P<date>[A-Z][a-z]+ \d{1,2}, \d{4})\b',
    r'\bas of (?P<date>[A-Z][a-z]+ \d{1,2}, \d{4})\b',
    r'\bthe "Effective Date"\)?[, ]*\s*(?:shall be|means)?\s*(?P<date>[A-Z][a-z]+ \d{1,2}, \d{4})\b',
]
DATE_ANY = re.compile(r'([A-Z][a-z]+ \d{1,2}, \d{4})')

def infer_base_dates(defs: Dict[str, Any], full_text: str) -> Dict[str, datetime.date]:
    base: Dict[str, datetime.date] = {}

    # 1) Definitions block wins if explicit
    DATE_STR_RE = re.compile(r'([A-Z][a-z]+ \d{1,2}, \d{4})')
    for term, d in defs.items():
        m = DATE_STR_RE.search(d["definition"])
        if m:
            try:
                base[term] = datetime.datetime.strptime(m.group(1), "%B %d, %Y").date()
            except: pass

    # 2) Preamble / “as of” phrases (scan first ~1–2 pages worth of text)
    head = "\n".join(full_text.splitlines()[:200])
    for pat in DATE_PHRASES:
        m = re.search(pat, head, flags=re.IGNORECASE)
        if m:
            try:
                d = datetime.datetime.strptime(m.group("date"), "%B %d, %Y").date()
                base.setdefault("Effective Date", d)
                break
            except: pass

    # 3) Signature block (“IN WITNESS WHEREOF…”) – take the latest date on the last page(s)
    tail = "\n".join(full_text.splitlines()[-300:])
    if "Effective Date" not in base:
        sig_dates = [datetime.datetime.strptime(x, "%B %d, %Y").date()
                     for x in DATE_ANY.findall(tail)
                     if re.search(r'WITNESS|SIGNED|By:', tail, re.IGNORECASE)]
        if sig_dates:
            base["Effective Date"] = max(sig_dates)

    # 4) Last resort: any date anywhere (first match)
    if "Effective Date" not in base:
        m = DATE_ANY.search(full_text)
        if m:
            try:
                base["Effective Date"] = datetime.datetime.strptime(m.group(1), "%B %d, %Y").date()
            except: pass

    return base


def add_business_days(d: datetime.date, n: int) -> datetime.date:
    delta = 0
    cur = d
    step = 1 if n >= 0 else -1
    while delta != n:
        cur += datetime.timedelta(days=step)
        if cur.weekday() < 5:
            delta += step
    return cur

def normalize_dates(text: str, base_dates: Dict[str, datetime.date]) -> str:
    def repl(m):
        num = int(m.group(1))
        kind = (m.group(2) or "calendar").lower()
        direction = m.group(4).lower()
        base_key = (m.group(6) or "").strip()
        base = base_dates.get(base_key) or base_dates.get(base_key.title()) or base_dates.get("Effective Date")
        if not base:
            return m.group(0)
        delta = num if direction in ("after","from") else -num
        if kind.startswith("business"):
            absd = add_business_days(base, delta)
        else:
            absd = base + datetime.timedelta(days=delta)
        return f'{m.group(0)} [ABSOLUTE: {absd.strftime("%B %d, %Y")}]'
    return DATE_EXPR_RE.sub(repl, text)

def materialize_text(node: Node, refs_by_source: Dict[str, List[Dict[str, Any]]], nodes_by_id: Dict[str, Node],
                     max_insert_chars: int = 600) -> str:
    t = node.text
    refs = sorted(refs_by_source.get(node.id, []), key=lambda r: r["span"][0], reverse=True)
    for r in refs:
        tgt_id = r.get("target_id")
        if tgt_id and tgt_id in nodes_by_id:
            tgt_text = nodes_by_id[tgt_id].text
            snippet = tgt_text[:max_insert_chars] + ("..." if len(tgt_text) > max_insert_chars else "")
            replacement = f'{r["surface"]} [RESOLVED {tgt_id}: "{snippet}"]'
            s, e = r["span"]
            t = t[:s] + replacement + t[e:]
        else:
            s, e = r["span"]
            replacement = f'{r["surface"]} [UNRESOLVED]'
            t = t[:s] + replacement + t[e:]
    return t

def resolve_legal_pdf_to_doc(path: str, effective_date_override: Optional[str] = None) -> Doc:
    nodes, full_text = parse_pdf_to_nodes(path)
    by_label = build_label_index(nodes)
    refs = detect_xrefs(nodes, by_label)
    defs = collect_definitions(nodes)

    base_dates = infer_base_dates(defs, full_text)
    if effective_date_override:
        try:
            base_dates["Effective Date"] = datetime.datetime.fromisoformat(effective_date_override).date()
        except Exception:
            try:
                base_dates["Effective Date"] = datetime.datetime.strptime(effective_date_override, "%Y-%m-%d").date()
            except Exception:
                pass

    nodes_by_id = {n.id: n for n in nodes}
    resolved_nodes = []
    for n in nodes:
        t = materialize_text(n, refs, nodes_by_id)
        t = normalize_dates(t, base_dates)
        header = f'{n.title}\n' + '-' * len(n.title) + '\n'
        resolved_nodes.append(header + t)

    resolved_text = "\n\n".join(resolved_nodes)
    doc_id = _make_doc_id(f"{path}::resolved")
    base = Path(path).name
    meta: Dict[str, str] = {"path": path, "resolved": "true"}
    if "Effective Date" in base_dates:
        meta["effective_date"] = base_dates["Effective Date"].isoformat()

    return Doc(doc_id=doc_id, source=base, text=resolved_text, metadata=meta)

def resolve_docs_for_index(paths: List[str], legal: bool = False, effective_date: Optional[str] = None) -> List[Doc]:
    out: List[Doc] = []
    for p in paths:
        ext = Path(p).suffix.lower()
        if legal and ext == ".pdf":
            out.append(resolve_legal_pdf_to_doc(p, effective_date_override=effective_date))
        else:
            with open(p, "r", encoding="utf-8", errors="ignore") as f:
                txt = f.read()
            out.append(Doc(doc_id=_make_doc_id(p), source=Path(p).name, text=txt, metadata={"path": p}))
    return out
