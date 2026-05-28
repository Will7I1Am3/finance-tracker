"""
API endpoint tests — covers all non-upload routes.
POST /statements/upload is excluded (requires a real PDF + LLM call).

Uses a temp SQLite DB per test so the real cc_tracker.db is never touched.
Run from the backend/ directory:
    pytest tests/test_endpoints.py -v

Coverage:
  Statements   — list, filter, get detail, save, duplicate rejection,
                 patch (period / balance / card rename), delete
  Transactions — list, filter, patch (edit fields, balance mismatch flag),
                 delete (sum update, field cascade),
                 add to statement (sum update, appears in list)
  Cards         — list, add, duplicate rejection, rename, delete, constraint 404s
"""

import pytest
import database
from fastapi.testclient import TestClient
from main import app
from deps import get_current_user

TEST_USER = {"user_id": 1, "email": "test@example.com"}

SAMPLE_STATEMENT = {
    "pdf_hash": "abc123",
    "card_name": "Chase",
    "period_start": "2026-03-01",
    "period_end": "2026-03-31",
    "statement_balance": "150.00",
    "transactions": [
        {"date": "2026-03-05", "description": "Whole Foods", "location": "CA", "category": "Groceries", "amount": "60.00"},
        {"date": "2026-03-10", "description": "Netflix", "location": "", "category": "Subscriptions", "amount": "90.00"},
    ],
}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "test.db")
    app.dependency_overrides[get_current_user] = lambda: TEST_USER
    with TestClient(app) as c:
        conn = database.get_connection()
        conn.execute("INSERT INTO users (id, google_id, email) VALUES (1, 'google-test', 'test@example.com')")
        conn.commit()
        conn.close()
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def saved_statement(client):
    res = client.post("/statements", json=SAMPLE_STATEMENT)
    assert res.status_code == 200
    return res.json()


# ---------------------------------------------------------------------------
# Statements — list + detail
# ---------------------------------------------------------------------------

def test_list_statements_empty(client):
    res = client.get("/statements")
    assert res.status_code == 200
    assert res.json() == []


def test_list_statements(client, saved_statement):
    res = client.get("/statements")
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) == 1
    assert rows[0]["card_name"] == "Chase"


def test_list_statements_filter_by_card(client, saved_statement):
    assert len(client.get("/statements?card_name=Chase").json()) == 1
    assert len(client.get("/statements?card_name=Amex").json()) == 0


def test_get_statement(client, saved_statement):
    sid = saved_statement["statement_id"]
    res = client.get(f"/statements/{sid}")
    assert res.status_code == 200
    body = res.json()
    assert body["card_name"] == "Chase"
    assert len(body["transactions"]) == 2
    assert body["transaction_sum"] == 150.0
    assert body["statement_balance"] == "150.00"


def test_get_statement_not_found(client):
    assert client.get("/statements/999").status_code == 404


# ---------------------------------------------------------------------------
# Statements — save
# ---------------------------------------------------------------------------

def test_save_statement(client):
    res = client.post("/statements", json=SAMPLE_STATEMENT)
    assert res.status_code == 200
    body = res.json()
    assert body["saved"] == 2
    assert "statement_id" in body


def test_save_duplicate_rejected(client, saved_statement):
    res = client.post("/statements", json=SAMPLE_STATEMENT)
    assert res.status_code == 409


# ---------------------------------------------------------------------------
# Statements — edit
# ---------------------------------------------------------------------------

def test_patch_statement(client, saved_statement):
    sid = saved_statement["statement_id"]
    res = client.patch(f"/statements/{sid}", json={"period_start": "2026-02-01", "statement_balance": "200.00"})
    assert res.status_code == 200
    body = res.json()
    assert body["period_start"] == "2026-02-01"
    assert body["statement_balance"] == "200.00"
    assert body["period_end"] == "2026-03-31"


def test_patch_statement_card_name(client, saved_statement):
    sid = saved_statement["statement_id"]
    res = client.patch(f"/statements/{sid}", json={"card_name": "Citi"})
    assert res.status_code == 200
    assert res.json()["card_name"] == "Citi"


def test_patch_statement_not_found(client):
    assert client.patch("/statements/999", json={"statement_balance": "0"}).status_code == 404


# ---------------------------------------------------------------------------
# Statements — delete
# ---------------------------------------------------------------------------

def test_delete_statement(client, saved_statement):
    sid = saved_statement["statement_id"]
    assert client.delete(f"/statements/{sid}").status_code == 200
    assert client.get(f"/statements/{sid}").status_code == 404
    assert client.get("/transactions").json() == []


def test_delete_statement_not_found(client):
    assert client.delete("/statements/999").status_code == 404


# ---------------------------------------------------------------------------
# Transactions — list
# ---------------------------------------------------------------------------

def test_list_transactions_empty(client):
    assert client.get("/transactions").json() == []


def test_list_transactions(client, saved_statement):
    res = client.get("/transactions")
    assert res.status_code == 200
    assert len(res.json()) == 2


def test_list_transactions_filter_by_card(client, saved_statement):
    assert len(client.get("/transactions?card_name=Chase").json()) == 2
    assert len(client.get("/transactions?card_name=Amex").json()) == 0


# ---------------------------------------------------------------------------
# Transactions — edit
# ---------------------------------------------------------------------------

def test_patch_transaction(client, saved_statement):
    txn_id = client.get("/transactions").json()[0]["id"]
    res = client.patch(f"/transactions/{txn_id}", json={"category": "Food", "amount": "70.00"})
    assert res.status_code == 200
    body = res.json()
    assert body["category"] == "Food"
    assert body["amount"] == "70.00"
    assert "transaction_sum" in body
    assert "statement_balance" in body


def test_patch_transaction_balance_mismatch_flagged(client, saved_statement):
    txn_id = client.get("/transactions").json()[0]["id"]
    res = client.patch(f"/transactions/{txn_id}", json={"amount": "999.00"})
    assert res.status_code == 200
    body = res.json()
    assert body["transaction_sum"] != float(body["statement_balance"])


def test_patch_transaction_not_found(client):
    assert client.patch("/transactions/999", json={"category": "Food"}).status_code == 404


# ---------------------------------------------------------------------------
# Transactions — delete
# ---------------------------------------------------------------------------

def test_delete_transaction(client, saved_statement):
    txn_id = client.get("/transactions").json()[0]["id"]
    res = client.delete(f"/transactions/{txn_id}")
    assert res.status_code == 200
    body = res.json()
    assert body["deleted"] is True
    assert "transaction_sum" in body
    assert "statement_balance" in body
    assert len(client.get("/transactions").json()) == 1


def test_delete_transaction_updates_sum(client, saved_statement):
    txns = client.get("/transactions").json()
    txn_id = txns[0]["id"]
    removed = float(txns[0]["amount"])
    res = client.delete(f"/transactions/{txn_id}")
    assert res.json()["transaction_sum"] == pytest.approx(150.0 - removed)


def test_delete_transaction_not_found(client):
    assert client.delete("/transactions/999").status_code == 404


# ---------------------------------------------------------------------------
# Transactions — add to statement
# ---------------------------------------------------------------------------

def test_add_transaction_to_statement(client, saved_statement):
    sid = saved_statement["statement_id"]
    res = client.post(f"/statements/{sid}/transactions", json={
        "date": "2026-03-15", "description": "Starbucks", "location": "CA",
        "category": "Food", "amount": "8.50",
    })
    assert res.status_code == 200
    body = res.json()
    assert body["description"] == "Starbucks"
    assert body["amount"] == "8.50"
    assert "transaction_sum" in body
    assert "statement_balance" in body


def test_add_transaction_updates_sum(client, saved_statement):
    sid = saved_statement["statement_id"]
    res = client.post(f"/statements/{sid}/transactions", json={
        "date": "2026-03-20", "description": "Uber", "location": "",
        "category": "Transportation", "amount": "25.00",
    })
    assert res.json()["transaction_sum"] == pytest.approx(175.0)  # 150.00 + 25.00


def test_add_transaction_appears_in_list(client, saved_statement):
    sid = saved_statement["statement_id"]
    client.post(f"/statements/{sid}/transactions", json={
        "date": "2026-03-20", "description": "Uber", "location": "",
        "category": "Transportation", "amount": "25.00",
    })
    assert len(client.get("/transactions").json()) == 3


def test_add_transaction_statement_not_found(client):
    assert client.post("/statements/999/transactions", json={
        "date": "2026-03-15", "description": "Ghost", "location": "",
        "category": "Misc", "amount": "5.00",
    }).status_code == 404


# ---------------------------------------------------------------------------
# Cards
# ---------------------------------------------------------------------------

def test_list_cards_empty(client):
    assert client.get("/cards").json() == []


def test_list_cards(client, saved_statement):
    cards = client.get("/cards").json()
    assert len(cards) == 1
    assert cards[0]["name"] == "Chase"


def test_list_cards_multiple(client, saved_statement):
    client.post("/statements", json={**SAMPLE_STATEMENT, "pdf_hash": "xyz999", "card_name": "Citi"})
    cards = client.get("/cards").json()
    assert len(cards) == 2
    assert {c["name"] for c in cards} == {"Chase", "Citi"}


def test_add_card(client):
    res = client.post("/cards", json={"name": "Apple Card"})
    assert res.status_code == 200
    assert res.json()["name"] == "Apple Card"


def test_add_duplicate_card_rejected(client):
    client.post("/cards", json={"name": "Apple Card"})
    assert client.post("/cards", json={"name": "Apple Card"}).status_code == 409


def test_rename_card(client, saved_statement):
    card_id = client.get("/cards").json()[0]["id"]
    res = client.patch(f"/cards/{card_id}", json={"name": "Chase Sapphire"})
    assert res.status_code == 200
    assert res.json()["name"] == "Chase Sapphire"


def test_rename_card_to_existing_name_rejected(client, saved_statement):
    client.post("/statements", json={**SAMPLE_STATEMENT, "pdf_hash": "xyz999", "card_name": "Citi"})
    card_id = client.get("/cards").json()[0]["id"]
    assert client.patch(f"/cards/{card_id}", json={"name": "Citi"}).status_code == 409


def test_rename_card_not_found(client):
    assert client.patch("/cards/999", json={"name": "Ghost"}).status_code == 404


def test_delete_card(client):
    res = client.post("/cards", json={"name": "Temp Card"})
    card_id = res.json()["id"]
    assert client.delete(f"/cards/{card_id}").status_code == 200
    assert client.get("/cards").json() == []


def test_delete_card_with_statements_rejected(client, saved_statement):
    card_id = client.get("/cards").json()[0]["id"]
    assert client.delete(f"/cards/{card_id}").status_code == 409


def test_delete_card_not_found(client):
    assert client.delete("/cards/999").status_code == 404
