import base64
import json
import os
from datetime import datetime, timezone

import fitz
from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from fastapi.responses import Response

from database import get_connection
from deps import get_current_user

router = APIRouter(prefix="/redact", tags=["redact"])

_DAILY_LIMIT = int(os.environ.get("DAILY_UPLOAD_LIMIT", "10"))


def _check_upload_limit(user: dict) -> None:
    conn = get_connection()
    row = conn.execute(
        "SELECT upload_count FROM usage WHERE user_id = %s AND date = %s",
        (user["user_id"], datetime.now(timezone.utc).date()),
    ).fetchone()
    conn.close()
    if (row["upload_count"] if row else 0) >= _DAILY_LIMIT:
        raise HTTPException(status_code=429, detail=f"Daily upload limit of {_DAILY_LIMIT} reached.")

_RENDER_SCALE = 2.0  # render pages at 2× resolution for sharpness


@router.post("/preview")
async def preview_pdf(
    file: UploadFile,
    user: dict = Depends(get_current_user),
) -> dict:
    """Render every page of the uploaded PDF as a base64 PNG."""
    _check_upload_limit(user)

    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    pdf_bytes = await file.read()
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    pages = []
    for page in doc:
        pix = page.get_pixmap(matrix=fitz.Matrix(_RENDER_SCALE, _RENDER_SCALE))
        pages.append({
            "image": base64.standard_b64encode(pix.tobytes("png")).decode(),
            "width": page.rect.width,    # PDF points — used for coordinate scaling
            "height": page.rect.height,
        })

    return {"pages": pages}


@router.post("/apply")
async def apply_redactions(
    file: UploadFile,
    rectangles: str = Form(...),  # JSON: [{page, x, y, w, h}, ...] in PDF point coords
    user: dict = Depends(get_current_user),
) -> Response:
    """Apply redaction rectangles to the PDF and return the redacted file."""
    _check_upload_limit(user)

    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    try:
        rects = json.loads(rectangles)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid rectangles JSON.")

    pdf_bytes = await file.read()
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    for r in rects:
        page_idx = int(r["page"])
        if page_idx < 0 or page_idx >= len(doc):
            continue
        page = doc[page_idx]
        rect = fitz.Rect(r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"])
        page.add_redact_annot(rect, fill=(0, 0, 0))

    for page in doc:
        page.apply_redactions()

    return Response(
        content=doc.tobytes(),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="redacted.pdf"'},
    )
