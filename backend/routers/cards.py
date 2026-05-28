import psycopg2

from fastapi import APIRouter, Depends, HTTPException

from database import get_connection
from deps import get_current_user
from models import CardRequest

router = APIRouter(prefix="/cards", tags=["cards"])


@router.get("", summary="List all cards")
def list_cards(user: dict = Depends(get_current_user)) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, name FROM cards WHERE user_id = %s ORDER BY name", (user["user_id"],)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("", summary="Add a new card")
def add_card(body: CardRequest, user: dict = Depends(get_current_user)) -> dict:
    conn = get_connection()
    try:
        row = conn.execute(
            "INSERT INTO cards (user_id, name) VALUES (%s, %s) RETURNING id, name",
            (user["user_id"], body.name),
        ).fetchone()
        conn.commit()
        conn.close()
        return dict(row)
    except psycopg2.IntegrityError:
        conn.close()
        raise HTTPException(status_code=409, detail=f"Card '{body.name}' already exists.")


@router.patch("/{card_id}", summary="Rename a card")
def update_card(card_id: int, body: CardRequest, user: dict = Depends(get_current_user)) -> dict:
    conn = get_connection()
    if not conn.execute(
        "SELECT 1 FROM cards WHERE id = %s AND user_id = %s", (card_id, user["user_id"])
    ).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Card not found.")
    try:
        conn.execute(
            "UPDATE cards SET name = %s WHERE id = %s AND user_id = %s",
            (body.name, card_id, user["user_id"]),
        )
        conn.commit()
        row = conn.execute("SELECT id, name FROM cards WHERE id = %s", (card_id,)).fetchone()
        conn.close()
        return dict(row)
    except psycopg2.IntegrityError:
        conn.close()
        raise HTTPException(status_code=409, detail=f"Card '{body.name}' already exists.")


@router.delete("/{card_id}", summary="Delete a card")
def delete_card(card_id: int, user: dict = Depends(get_current_user)) -> dict:
    conn = get_connection()
    if not conn.execute(
        "SELECT 1 FROM cards WHERE id = %s AND user_id = %s", (card_id, user["user_id"])
    ).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Card not found.")
    if conn.execute("SELECT 1 FROM statements WHERE card_id = %s", (card_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=409, detail="Cannot delete card with existing statements.")
    if conn.execute("SELECT 1 FROM transactions WHERE card_id = %s", (card_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=409, detail="Cannot delete card with existing transactions.")
    conn.execute("DELETE FROM cards WHERE id = %s", (card_id,))
    conn.commit()
    conn.close()
    return {"deleted": True}
