from typing import Optional

from pydantic import BaseModel


CATEGORIES = [
    "Food",
    "Groceries",
    "Shopping",
    "Gas",
    "Transportation",
    "Entertainment",
    "Travel",
    "Education",
    "Health/Medical",
    "Subscriptions",
    "Installments",
    "Misc",
]


class Transaction(BaseModel):
    date: str
    description: str
    location: str = ""
    category: str
    amount: str


class ExtractionResult(BaseModel):
    pdf_hash: str
    card_name: str
    period_start: str
    period_end: str
    statement_balance: str
    transactions: list[Transaction]


class SaveRequest(BaseModel):
    pdf_hash: str
    card_name: str
    period_start: str
    period_end: str
    statement_balance: str
    transactions: list[Transaction]


class UpdateStatementRequest(BaseModel):
    card_name: Optional[str] = None
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    statement_balance: Optional[str] = None


class UpdateTransactionRequest(BaseModel):
    date: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    location: Optional[str] = None
    amount: Optional[str] = None


class CardRequest(BaseModel):
    name: str
