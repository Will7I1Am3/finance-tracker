import os

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile

from database import get_connection
from deps import get_current_user
from extractor import extract_from_pdf
from redactor import redact
from models import ExtractionResult, SaveRequest, Transaction, UpdateStatementRequest

router = APIRouter(prefix="/statements", tags=["statements"])

_DAILY_LIMIT = int(os.environ.get("DAILY_UPLOAD_LIMIT", "10"))


@router.get("", summary="List all saved statements")
def list_statements(
    card_name: str | None = None,
    user: dict = Depends(get_current_user),
) -> list[dict]:
    conn = get_connection()
    query = """
        SELECT s.id, c.name AS card_name, s.period_start, s.period_end, s.statement_balance
        FROM statements s
        JOIN cards c ON c.id = s.card_id
        WHERE c.user_id = %s
    """
    params: tuple = (user["user_id"],)
    if card_name:
        query += " AND c.name = %s"
        params += (card_name,)
    query += " ORDER BY s.period_end DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.get("/usage", summary="Get today's upload count for the current user")
def get_usage(user: dict = Depends(get_current_user)) -> dict:
    conn = get_connection()
    row = conn.execute(
        "SELECT upload_count FROM usage WHERE user_id = %s AND date = CURRENT_DATE",
        (user["user_id"],),
    ).fetchone()
    conn.close()
    return {"used": row["upload_count"] if row else 0, "limit": _DAILY_LIMIT}


@router.get("/{statement_id}", summary="Get a statement with its transactions")
def get_statement(statement_id: int, user: dict = Depends(get_current_user)) -> dict:
    conn = get_connection()

    row = conn.execute(
        "SELECT s.id, c.name AS card_name, s.period_start, s.period_end, s.statement_balance "
        "FROM statements s JOIN cards c ON c.id = s.card_id "
        "WHERE s.id = %s AND c.user_id = %s",
        (statement_id, user["user_id"]),
    ).fetchone()

    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Statement not found.")

    transactions = conn.execute(
        "SELECT id, date, description, location, category, amount "
        "FROM transactions WHERE statement_id = %s ORDER BY date",
        (statement_id,),
    ).fetchall()

    transaction_sum = sum(float(t["amount"]) for t in transactions)
    conn.close()
    return {
        **dict(row),
        "transactions": [dict(t) for t in transactions],
        "transaction_sum": round(transaction_sum, 2),
    }


@router.post("/upload", response_model=ExtractionResult, summary="Extract transactions from a PDF statement")
async def upload_statement(
    file: UploadFile,
    original_hash: str | None = Form(None),
    user: dict = Depends(get_current_user),
) -> ExtractionResult:
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    pdf_bytes = await file.read()

    conn = get_connection()

    # Rate limit check + increment (atomic within same connection)
    usage_row = conn.execute(
        "SELECT upload_count FROM usage WHERE user_id = %s AND date = CURRENT_DATE",
        (user["user_id"],),
    ).fetchone()
    current_count = usage_row["upload_count"] if usage_row else 0
    if current_count >= _DAILY_LIMIT:
        conn.close()
        raise HTTPException(status_code=429, detail=f"Daily upload limit of {_DAILY_LIMIT} reached.")

    existing_cards = [
        r["name"]
        for r in conn.execute(
            "SELECT name FROM cards WHERE user_id = %s ORDER BY name", (user["user_id"],)
        ).fetchall()
    ]
    corrections = [
        dict(r)
        for r in conn.execute(
            "SELECT description, category FROM category_corrections WHERE user_id = %s",
            (user["user_id"],),
        ).fetchall()
    ]
    conn.close()

    try:
        result = extract_from_pdf(pdf_bytes, existing_cards, corrections)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # If the caller supplied the original file's hash (e.g. sent a redacted copy),
    # use that so duplicate detection matches the unmodified statement.
    if original_hash:
        result = result.model_copy(update={"pdf_hash": original_hash})

    conn = get_connection()
    if conn.execute(
        "SELECT 1 FROM statements WHERE user_id = %s AND pdf_hash = %s",
        (user["user_id"], result.pdf_hash),
    ).fetchone():
        conn.close()
        raise HTTPException(status_code=409, detail="This statement has already been uploaded.")

    conn.execute(
        "INSERT INTO usage (user_id, date, upload_count) VALUES (%s, CURRENT_DATE, 1)"
        " ON CONFLICT (user_id, date) DO UPDATE SET upload_count = usage.upload_count + 1",
        (user["user_id"],),
    )
    conn.commit()
    conn.close()

    return result


@router.post("", summary="Save a reviewed statement and its transactions")
def save_statement(body: SaveRequest, user: dict = Depends(get_current_user)) -> dict:
    conn = get_connection()

    if conn.execute(
        "SELECT 1 FROM statements WHERE user_id = %s AND pdf_hash = %s",
        (user["user_id"], body.pdf_hash),
    ).fetchone():
        conn.close()
        raise HTTPException(status_code=409, detail="Already saved.")

    conn.execute(
        "INSERT INTO cards (user_id, name) VALUES (%s, %s) ON CONFLICT (user_id, name) DO NOTHING",
        (user["user_id"], body.card_name),
    )
    card_id = conn.execute(
        "SELECT id FROM cards WHERE user_id = %s AND name = %s", (user["user_id"], body.card_name)
    ).fetchone()["id"]

    if conn.execute(
        "SELECT 1 FROM statements WHERE card_id = %s AND period_start = %s AND period_end = %s",
        (card_id, body.period_start, body.period_end),
    ).fetchone():
        conn.close()
        raise HTTPException(
            status_code=409,
            detail=f"A statement for {body.card_name} covering {body.period_start} – {body.period_end} already exists.",
        )

    statement_id = conn.execute(
        "INSERT INTO statements (user_id, card_id, period_start, period_end, pdf_hash, statement_balance) "
        "VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
        (user["user_id"], card_id, body.period_start, body.period_end, body.pdf_hash, body.statement_balance),
    ).fetchone()["id"]

    for t in body.transactions:
        conn.execute(
            "INSERT INTO transactions (statement_id, card_id, date, description, location, category, amount) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (statement_id, card_id, t.date, t.description, t.location, t.category, t.amount),
        )

    conn.commit()
    conn.close()
    return {"statement_id": statement_id, "saved": len(body.transactions)}


@router.patch("/{statement_id}", summary="Edit statement metadata")
def update_statement(
    statement_id: int,
    body: UpdateStatementRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    conn = get_connection()

    if not conn.execute(
        "SELECT 1 FROM statements s JOIN cards c ON c.id = s.card_id "
        "WHERE s.id = %s AND c.user_id = %s",
        (statement_id, user["user_id"]),
    ).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Statement not found.")

    if body.card_name is not None:
        conn.execute(
            "INSERT INTO cards (user_id, name) VALUES (%s, %s) ON CONFLICT (user_id, name) DO NOTHING",
            (user["user_id"], body.card_name),
        )
        card_id = conn.execute(
            "SELECT id FROM cards WHERE user_id = %s AND name = %s", (user["user_id"], body.card_name)
        ).fetchone()["id"]
        conn.execute("UPDATE statements SET card_id = %s WHERE id = %s", (card_id, statement_id))
        conn.execute("UPDATE transactions SET card_id = %s WHERE statement_id = %s", (card_id, statement_id))

    if body.period_start is not None:
        conn.execute("UPDATE statements SET period_start = %s WHERE id = %s", (body.period_start, statement_id))

    if body.period_end is not None:
        conn.execute("UPDATE statements SET period_end = %s WHERE id = %s", (body.period_end, statement_id))

    if body.statement_balance is not None:
        conn.execute("UPDATE statements SET statement_balance = %s WHERE id = %s", (body.statement_balance, statement_id))

    conn.commit()

    row = conn.execute(
        "SELECT s.id, c.name AS card_name, s.period_start, s.period_end, s.statement_balance "
        "FROM statements s JOIN cards c ON c.id = s.card_id WHERE s.id = %s",
        (statement_id,),
    ).fetchone()
    conn.close()
    return dict(row)


@router.delete("/{statement_id}", summary="Delete a statement and its transactions")
def delete_statement(statement_id: int, user: dict = Depends(get_current_user)) -> dict:
    conn = get_connection()

    if not conn.execute(
        "SELECT 1 FROM statements s JOIN cards c ON c.id = s.card_id "
        "WHERE s.id = %s AND c.user_id = %s",
        (statement_id, user["user_id"]),
    ).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Statement not found.")

    conn.execute("DELETE FROM transactions WHERE statement_id = %s", (statement_id,))
    conn.execute("DELETE FROM statements WHERE id = %s", (statement_id,))
    conn.commit()
    conn.close()
    return {"deleted": True}


@router.post("/{statement_id}/transactions", summary="Add a transaction to a statement")
def add_transaction(
    statement_id: int,
    body: Transaction,
    user: dict = Depends(get_current_user),
) -> dict:
    conn = get_connection()

    row = conn.execute(
        "SELECT s.card_id, s.statement_balance FROM statements s "
        "JOIN cards c ON c.id = s.card_id "
        "WHERE s.id = %s AND c.user_id = %s",
        (statement_id, user["user_id"]),
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Statement not found.")

    card_id = row["card_id"]
    txn = conn.execute(
        "INSERT INTO transactions (statement_id, card_id, date, description, location, category, amount) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING *",
        (statement_id, card_id, body.date, body.description, body.location, body.category, body.amount),
    ).fetchone()
    conn.commit()

    amounts = conn.execute(
        "SELECT amount FROM transactions WHERE statement_id = %s", (statement_id,)
    ).fetchall()
    transaction_sum = round(sum(float(r["amount"]) for r in amounts), 2)

    conn.close()
    return {**dict(txn), "transaction_sum": transaction_sum, "statement_balance": row["statement_balance"]}
