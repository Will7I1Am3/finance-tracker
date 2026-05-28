from fastapi import APIRouter, Depends, HTTPException

from database import get_connection
from deps import get_current_user
from models import UpdateTransactionRequest

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("", summary="List all transactions")
def list_transactions(
    card_name: str | None = None,
    user: dict = Depends(get_current_user),
) -> list[dict]:
    conn = get_connection()
    query = """
        SELECT t.id, c.name AS card_name, t.date, t.description, t.location,
               t.category, t.amount, t.statement_id
        FROM transactions t
        JOIN cards c ON c.id = t.card_id
        WHERE c.user_id = %s
    """
    params: tuple = (user["user_id"],)
    if card_name:
        query += " AND c.name = %s"
        params += (card_name,)
    query += " ORDER BY t.date DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.delete("/{transaction_id}", summary="Delete a transaction")
def delete_transaction(transaction_id: int, user: dict = Depends(get_current_user)) -> dict:
    conn = get_connection()

    row = conn.execute(
        "SELECT t.* FROM transactions t JOIN cards c ON c.id = t.card_id "
        "WHERE t.id = %s AND c.user_id = %s",
        (transaction_id, user["user_id"]),
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Transaction not found.")

    statement_id = dict(row)["statement_id"]
    statement_balance = conn.execute(
        "SELECT statement_balance FROM statements WHERE id = %s", (statement_id,)
    ).fetchone()["statement_balance"]

    conn.execute("DELETE FROM transactions WHERE id = %s", (transaction_id,))
    conn.commit()

    amounts = conn.execute(
        "SELECT amount FROM transactions WHERE statement_id = %s", (statement_id,)
    ).fetchall()
    transaction_sum = round(sum(float(r["amount"]) for r in amounts), 2)

    conn.close()
    return {"deleted": True, "transaction_sum": transaction_sum, "statement_balance": statement_balance}


@router.patch("/{transaction_id}", summary="Edit a transaction")
def update_transaction(
    transaction_id: int,
    body: UpdateTransactionRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    conn = get_connection()

    row = conn.execute(
        "SELECT t.* FROM transactions t JOIN cards c ON c.id = t.card_id "
        "WHERE t.id = %s AND c.user_id = %s",
        (transaction_id, user["user_id"]),
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Transaction not found.")

    for field in ("description", "category", "location", "amount"):
        value = getattr(body, field)
        if value is not None:
            conn.execute(
                f"UPDATE transactions SET {field} = %s WHERE id = %s",
                (value, transaction_id),
            )

    if body.category is not None:
        current_description = dict(row)["description"]
        conn.execute(
            "INSERT INTO category_corrections (user_id, description, category) VALUES (%s, %s, %s)"
            " ON CONFLICT(user_id, description) DO UPDATE SET category = excluded.category",
            (user["user_id"], current_description, body.category),
        )

    conn.commit()

    updated = dict(conn.execute("SELECT * FROM transactions WHERE id = %s", (transaction_id,)).fetchone())

    amounts = conn.execute(
        "SELECT amount FROM transactions WHERE statement_id = %s", (updated["statement_id"],)
    ).fetchall()
    transaction_sum = sum(float(r["amount"]) for r in amounts)

    statement_balance = conn.execute(
        "SELECT statement_balance FROM statements WHERE id = %s", (updated["statement_id"],)
    ).fetchone()["statement_balance"]

    conn.close()
    return {
        **updated,
        "transaction_sum": round(transaction_sum, 2),
        "statement_balance": statement_balance,
    }
