"""
PDF extraction module — converts PDF bytes to structured ExtractionResult via Claude.
"""

import base64
import hashlib
import json
import sys
from pathlib import Path

import anthropic
from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, str(Path(__file__).parent))
from models import CATEGORIES, ExtractionResult, Transaction


def _build_prompt(existing_cards: list[str], corrections: list[dict] | None = None) -> str:

    category_list = ", ".join(CATEGORIES)

    if existing_cards:
        card_match_instruction = (
            "For card_name: first check if the detected card matches one of these existing cards "
            f"(use exact string if so): {', '.join(repr(c) for c in existing_cards)}. "
            "Otherwise use a short descriptive name (e.g. \"Chase Sapphire Preferred\", \"Apple Card\", \"Citi Double Cash\")."
        )
    else:
        card_match_instruction = (
            "For card_name: use a short descriptive name for the card issuer and product "
            "(e.g. \"Chase Sapphire Preferred\", \"Apple Card\", \"Citi Double Cash\")."
        )

    corrections_section = ""
    if corrections:
        examples = "\n".join(f'- "{c["description"]}" → {c["category"]}' for c in corrections)
        corrections_section = f"\n\nPreviously corrected categories (prefer these when the description matches):\n{examples}"

    return f"""You are evaluating a document to determine if it is a credit card statement, then extracting its transactions.{corrections_section}

Return ONLY valid JSON with no markdown and no prose.

If the document is NOT a credit card or charge card billing statement (e.g. it is a bank statement, utility bill, receipt, tax form, or any other document):
{{
  "valid_input": false,
  "rejection_reason": "In less than 100 characters, provide a plain English explanation of why this is not a credit card statement"
}}

If the document IS a credit card statement, extract all transactions and return:
{{
  "valid_input": true,
  "card_name": "detected card name (see rules below)",
  "period_start": "YYYY-MM-DD",
  "period_end": "YYYY-MM-DD",
  "statement_balance": "positive decimal string",
  "transactions": [
    {{
      "date": "YYYY-MM-DD",
      "description": "merchant name",
      "location": "2-letter state abbreviation (e.g. CA) or empty string if not present",
      "category": "exactly one category from the fixed list",
      "amount": "positive decimal string, e.g. 12.34"
    }}
  ]
}}

Fixed categories — pick exactly one per transaction: {category_list}

Rules:
- {card_match_instruction}
- For period_start and period_end: read the billing cycle / statement period printed on the statement (look for labels like "Billing Period", "Statement Period", "Closing Date", "Opening Date"). Do NOT infer these dates from the earliest/latest transaction date. Use empty string "" if the dates are not visible or were redacted.
- For statement_balance: extract the total amount due for this billing cycle (look for "New Balance", "Statement Balance", "Total Amount Due", "Amount Due", or on Apple Card "Your [Month] Balance"). Use empty string "" if not found.
- DO NOT extract or include: account numbers, card numbers, SSNs, full name on account, routing numbers, credit limit
- Skip payment/credit line items (entries that reduce the balance, e.g. "Payment - Thank You", "ACH Deposit", "Online Payment")
- amounts are always positive decimal strings (no dollar signs, no negative numbers)
- location is the 2-letter state abbreviation only (e.g. "CA", "NY") — drop the city; use empty string "" if no state is present
- Monthly installment plans: some cards (e.g. Apple Card, Chase My Chase Plan, Citi Flex Pay) have a dedicated installments section listing items being paid off over time. Include each installment as a transaction with category "Installments". Use the installment amount due this billing period (look for labels like "This month's installment", "Monthly payment", "Amount due this month"). Set the date to the same day-of-month as the original purchase date but in the billing period's month and year (e.g. original date 12/25/2025 with billing period March 2026 → 2026-03-25). If no original purchase date is listed, use the billing period end date. Use the merchant name as description and extract the state abbreviation from the location if present."""


def extract_from_pdf(
    pdf_bytes: bytes,
    existing_cards: list[str] | None = None,
    corrections: list[dict] | None = None,
) -> ExtractionResult:
    """Send PDF bytes to Claude and return structured ExtractionResult."""
    client = anthropic.Anthropic()

    pdf_b64 = base64.standard_b64encode(pdf_bytes).decode("utf-8")
    pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()
    prompt = _build_prompt(existing_cards or [], corrections or [])

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=8192,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "document",
                        "source": {
                            "type": "base64",
                            "media_type": "application/pdf",
                            "data": pdf_b64,
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ],
    )

    raw = response.content[0].text.strip()
    # Strip markdown code fences if Claude wraps the JSON anyway
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    data = json.loads(raw)

    if not data.get("valid_input", True):
        raise ValueError(data.get("rejection_reason", "Document is not a valid credit card statement."))

    return ExtractionResult(
        pdf_hash=pdf_hash,
        card_name=data.get("card_name") or "",
        period_start=data.get("period_start") or "",
        period_end=data.get("period_end") or "",
        statement_balance=data.get("statement_balance") or "",
        transactions=[
            Transaction(**{**t, "date": t.get("date") or ""})
            for t in data.get("transactions", [])
        ],
    )


def check_balance(result: ExtractionResult) -> dict:
    """Return expected, actual, diff, and whether they match."""
    expected = round(float(result.statement_balance), 2)
    actual = round(sum(float(t.amount) for t in result.transactions), 2)
    diff = round(actual - expected, 2)
    return {"expected": expected, "actual": actual, "diff": diff, "ok": diff == 0.0}
