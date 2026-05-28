#!/usr/bin/env python3
"""Verify that transaction amounts in a groundtruth file sum to the statement balance."""

import json
import sys
from decimal import Decimal
from pathlib import Path


def check(path: str) -> None:
    data = json.loads(Path(path).read_text())

    card = data.get("card_name", "Unknown")
    period = f"{data.get('period_start')} → {data.get('period_end')}"
    stated = Decimal(data["statement_balance"])
    transactions = data.get("transactions", [])

    total = sum(Decimal(t["amount"]) for t in transactions)
    diff = total - stated

    print(f"Card   : {card}")
    print(f"Period : {period}")
    print(f"Transactions : {len(transactions)}")
    print(f"Sum of amounts   : {total:.2f}")
    print(f"Statement balance: {stated:.2f}")

    if diff == 0:
        print("PASS — amounts match statement balance exactly")
    else:
        print(f"FAIL — difference: {diff:+.2f}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: python {Path(__file__).name} <groundtruth.json> [...]")
        sys.exit(1)

    for arg in sys.argv[1:]:
        if len(sys.argv) > 2:
            print(f"\n=== {arg} ===")
        check(arg)
