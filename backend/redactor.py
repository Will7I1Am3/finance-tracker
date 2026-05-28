"""
Strip PII from a PDF's text layer before sending to the LLM.

Redacts: 16/15-digit card numbers, SSNs, and values following
account/routing number labels.

Image-only PDFs (no text layer) pass through unchanged.
"""

import re

import fitz  # pymupdf

# Applied against each reconstructed line of text
_DIRECT_PATTERNS = [
    re.compile(r'(?:\d{4}[\s\-]){3}\d{4}'),   # 16-digit card number with separators
    re.compile(r'\b\d{15,16}\b'),               # bare 15 or 16-digit number
    re.compile(r'\b\d{3}-\d{2}-\d{4}\b'),      # SSN
]

# If a line contains one of these labels, redact everything after the label
_LABEL_RE = re.compile(
    r'(?i)\b(account\s*(?:number|#|no\.?)|routing\s*(?:number|#|no\.?))\b'
)


def redact(pdf_bytes: bytes) -> bytes:
    """Return PDF bytes with PII in the text layer replaced by black rectangles."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    for page in doc:
        for block in page.get_text("dict")["blocks"]:
            if block.get("type") != 0:  # 0 = text block; skip image blocks
                continue
            for line in block.get("lines", []):
                spans = line.get("spans", [])
                if not spans:
                    continue

                # Reconstruct the full line text and track each span's char range
                line_text = ""
                offsets: list[tuple[int, int, int]] = []  # (start, end, span_index)
                for i, span in enumerate(spans):
                    start = len(line_text)
                    line_text += span["text"]
                    offsets.append((start, len(line_text), i))

                hit: set[int] = set()

                # Direct pattern matches — collect all overlapping span indices
                for pat in _DIRECT_PATTERNS:
                    for m in pat.finditer(line_text):
                        for s, e, idx in offsets:
                            if s < m.end() and e > m.start():
                                hit.add(idx)

                # Label match — redact every span that comes after the label
                label_m = _LABEL_RE.search(line_text)
                if label_m:
                    for s, e, idx in offsets:
                        if e > label_m.end():
                            hit.add(idx)

                for idx in hit:
                    page.add_redact_annot(fitz.Rect(spans[idx]["bbox"]))

        page.apply_redactions()

    return doc.tobytes()


if __name__ == "__main__":
    import sys
    from pathlib import Path

    if len(sys.argv) != 3:
        print("Usage: python redactor.py <input.pdf> <output.pdf>")
        sys.exit(1)

    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])

    redacted = redact(src.read_bytes())
    dst.write_bytes(redacted)
    print(f"Redacted PDF written to {dst}")
