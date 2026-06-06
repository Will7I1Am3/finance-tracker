"""
Eval CLI — extract a PDF statement and compare against a groundtruth file.

Usage:
  # Look up by name in test_manifest.json (auto-resolves card + groundtruth)
  python eval.py --file documents/february_chase_card.pdf
  python eval.py --file documents/march_apple_card.pdf --save-eval

  # Run all cases from the manifest and print a summary table
  python eval.py --batch
  python eval.py --batch --save-eval
"""

import argparse
import calendar
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from extractor import check_balance, extract_from_pdf
from models import ExtractionResult


def eval_accuracy(extracted: ExtractionResult, expected_path: Path, card_name: str) -> dict:
    expected = json.loads(expected_path.read_text())
    exp_txns = expected.get("transactions", [])

    sort_key = lambda t: (t.get("date", ""), t.get("amount", ""))
    exp_txns_sorted = sorted(exp_txns, key=sort_key)
    ext_txns_sorted = sorted([t.model_dump() for t in extracted.transactions], key=sort_key)

    fields = ["date", "location", "category", "amount"]
    print(f"\n=== Eval vs {expected_path.name} ===")

    count_ok = len(exp_txns) == len(ext_txns_sorted)
    print(f"  Transactions — expected {len(exp_txns)}, extracted {len(ext_txns_sorted)}", end="")
    print("  ✓" if count_ok else "  ✗ COUNT MISMATCH")

    matched = min(len(exp_txns_sorted), len(ext_txns_sorted))
    field_hits = {f: 0 for f in fields}
    transactions_detail = []
    for i in range(matched):
        ext = ext_txns_sorted[i]
        exp = exp_txns_sorted[i]
        field_match = {}
        for f in fields:
            ok = str(ext.get(f, "")).strip() == str(exp.get(f, "")).strip()
            field_match[f] = ok
            if ok:
                field_hits[f] += 1
        transactions_detail.append({
            "index": i + 1,
            "extracted": ext,
            "expected": exp,
            "field_match": field_match,
        })

    unmatched_extracted = ext_txns_sorted[matched:]
    unmatched_expected = exp_txns_sorted[matched:]

    field_accuracy = {}
    for f in fields:
        pct = (field_hits[f] / matched * 100) if matched else 0
        field_accuracy[f] = {"hits": field_hits[f], "matched": matched, "pct": round(pct, 1)}
        print(f"  {f:15s}: {field_hits[f]}/{matched} ({pct:.0f}%)")

    exp_start = expected.get("period_start", "")
    exp_end = expected.get("period_end", "")
    start_ok = extracted.period_start == exp_start
    end_ok = extracted.period_end == exp_end
    print(f"  {'period_start':15s}: {'✓' if start_ok else f'✗ got {extracted.period_start!r}, want {exp_start!r}'}")
    print(f"  {'period_end':15s}: {'✓' if end_ok else f'✗ got {extracted.period_end!r}, want {exp_end!r}'}")

    exp_balance = expected.get("statement_balance", "")
    try:
        balance_match = round(float(extracted.statement_balance), 2) == round(float(exp_balance), 2)
        bal_status = "✓" if balance_match else f"✗ got {extracted.statement_balance!r}, want {exp_balance!r}"
    except (ValueError, TypeError):
        balance_match = extracted.statement_balance.strip() == str(exp_balance).strip()
        bal_status = "✓" if balance_match else f"✗ got {extracted.statement_balance!r}, want {exp_balance!r}"
    print(f"  {'stmt_balance':15s}: {bal_status}")

    balance_check = check_balance(extracted)
    diff = balance_check["diff"]
    status = "✓" if diff == 0.0 else f"✗ diff={diff:+.2f}"
    print(f"  {'balance_check':15s}: extracted sum={balance_check['actual']:.2f}, statement={balance_check['expected']:.2f}  {status}")

    neg_examples = expected.get("negative_examples", [])
    leaked: list[str] = []
    if neg_examples:
        neg_descs = {e.get("description", "").lower() for e in neg_examples}
        ext_descs = {t.description.lower() for t in extracted.transactions}
        leaked = sorted(neg_descs & ext_descs)
        status = "✓" if not leaked else f"✗ leaked: {leaked}"
        print(f"  {'negative_ex':15s}: {status}")

    return {
        "groundtruth_file": expected_path.name,
        "card_name": card_name,
        "period_start": {"expected": exp_start, "extracted": extracted.period_start, "ok": start_ok},
        "period_end": {"expected": exp_end, "extracted": extracted.period_end, "ok": end_ok},
        "stmt_balance": {
            "expected": exp_balance,
            "extracted": extracted.statement_balance,
            "ok": balance_match,
        },
        "transaction_count": {
            "expected": len(exp_txns),
            "extracted": len(ext_txns_sorted),
            "ok": count_ok,
        },
        "field_accuracy": field_accuracy,
        "balance_check": balance_check,
        "negative_examples": {"leaked": leaked, "ok": not leaked},
        "transactions": transactions_detail,
        "unmatched_extracted": unmatched_extracted,
        "unmatched_expected": unmatched_expected,
    }


def run_case(entry: dict, base: Path) -> dict:
    """Run one manifest entry. Returns structured result."""
    pdf_path = base / entry["pdf"]
    card_name = entry["card"]
    expected_valid = entry["valid"]

    print(f"\n{'─' * 60}")
    print(f"PDF   : {entry['pdf']}")
    print(f"Card  : {card_name}  |  Expected: {'GOOD' if expected_valid else 'BAD'}")

    try:
        result, _ = extract_from_pdf(pdf_path.read_bytes(), existing_cards=[card_name])
        actual_valid = True
        rejection_reason = None
    except ValueError as e:
        actual_valid = False
        rejection_reason = str(e)
        result = None

    classification_ok = actual_valid == expected_valid

    if not actual_valid:
        print(f"  Rejected — reason: {rejection_reason!r}")

    if classification_ok:
        label = "correctly accepted" if actual_valid else "correctly rejected"
        print(f"  Classification: ✓ ({label})")
    else:
        label = "FALSE NEGATIVE (accepted a bad doc)" if not expected_valid else "FALSE POSITIVE (rejected a good doc)"
        print(f"  Classification: ✗ {label}")

    extraction_metrics = None
    if expected_valid and actual_valid:
        groundtruth_path = base / entry["groundtruth"]
        extraction_metrics = eval_accuracy(result, groundtruth_path, card_name)

    return {
        "pdf": entry["pdf"],
        "card_name": card_name,
        "expected_valid": expected_valid,
        "actual_valid": actual_valid,
        "classification_ok": classification_ok,
        "rejection_reason": rejection_reason,
        "extraction": extraction_metrics,
    }


def _print_batch_summary(cases: list[dict]) -> None:
    W = 104
    print(f"\n{'=' * W}")
    print("BATCH SUMMARY")
    print(f"{'=' * W}")
    print(f"{'PDF':<32} {'Expected':<8} {'Class':^7} {'Txns':^9} {'date':^6} {'loc':^6} {'cat':^6} {'amt':^6} {'bal':^5}")
    print(f"{'─' * W}")

    for c in cases:
        name = Path(c["pdf"]).stem[:31]
        expected_label = "GOOD" if c["expected_valid"] else "BAD"
        class_sym = "✓" if c["classification_ok"] else "✗"

        ext = c.get("extraction")
        if ext:
            fa = ext["field_accuracy"]
            txn_exp = ext["transaction_count"]["expected"]
            txn_ext = ext["transaction_count"]["extracted"]
            txns = f"{txn_ext}/{txn_exp}"
            date_s = f"{fa['date']['pct']:.0f}%"
            loc_s  = f"{fa['location']['pct']:.0f}%"
            cat_s  = f"{fa['category']['pct']:.0f}%"
            amt_s  = f"{fa['amount']['pct']:.0f}%"
            bal    = "✓" if ext["balance_check"]["ok"] else "✗"
        else:
            txns = date_s = loc_s = cat_s = amt_s = bal = "N/A"

        print(f"{name:<32} {expected_label:<8} {class_sym:^7} {txns:^9} {date_s:^6} {loc_s:^6} {cat_s:^6} {amt_s:^6} {bal:^5}")

    print(f"{'=' * W}")

    total = len(cases)
    class_correct = sum(1 for c in cases if c["classification_ok"])
    print(f"Classification : {class_correct}/{total} ({class_correct / total * 100:.1f}%)")

    good = [c for c in cases if c["expected_valid"] and c.get("extraction")]
    if good:
        print()
        for field in ["date", "location", "category", "amount"]:
            hits = sum(c["extraction"]["field_accuracy"][field]["hits"] for c in good)
            matched = sum(c["extraction"]["field_accuracy"][field]["matched"] for c in good)
            pct = (hits / matched * 100) if matched else 0
            print(f"Extraction {field:<10}: {hits}/{matched} ({pct:.1f}%)")


def _plot_batch_analysis(cases: list[dict]) -> None:
    import matplotlib.pyplot as plt
    import numpy as np

    valid = [c for c in cases if c["expected_valid"] and c.get("extraction")]
    fields = ["date", "location", "category", "amount"]

    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle("Batch Eval Analysis", fontsize=14, fontweight="bold")

    # 1. Classification accuracy
    ax = axes[0][0]
    correct = sum(1 for c in cases if c["classification_ok"])
    incorrect = len(cases) - correct
    bars = ax.bar(["Correct", "Incorrect"], [correct, incorrect], color=["#4caf50", "#f44336"])
    ax.set_title("Classification Accuracy")
    ax.set_ylabel("Count")
    ax.set_ylim(0, len(cases) + 2)
    for bar, val in zip(bars, [correct, incorrect]):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.1, str(val), ha="center", va="bottom", fontweight="bold")

    # 2. Overall field accuracy across valid cases
    ax = axes[0][1]
    pcts = []
    for f in fields:
        hits = sum(c["extraction"]["field_accuracy"][f]["hits"] for c in valid)
        matched = sum(c["extraction"]["field_accuracy"][f]["matched"] for c in valid)
        pcts.append(hits / matched * 100 if matched else 0)
    bars = ax.bar(fields, pcts, color=["#2196f3", "#ff9800", "#9c27b0", "#00bcd4"])
    ax.set_title("Field Accuracy (Valid Cases)")
    ax.set_ylabel("Accuracy %")
    ax.set_ylim(0, 115)
    for bar, pct in zip(bars, pcts):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 1, f"{pct:.0f}%", ha="center", va="bottom")

    # 3. Transaction count per case
    ax = axes[1][0]
    names = [Path(c["pdf"]).stem[:20] for c in valid]
    expected_counts = [c["extraction"]["transaction_count"]["expected"] for c in valid]
    extracted_counts = [c["extraction"]["transaction_count"]["extracted"] for c in valid]
    x = np.arange(len(names))
    w = 0.35
    ax.bar(x - w / 2, expected_counts, w, label="Expected", color="#4caf50")
    ax.bar(x + w / 2, extracted_counts, w, label="Extracted", color="#2196f3")
    ax.set_title("Transaction Count per Case")
    ax.set_ylabel("Count")
    ax.set_xticks(x)
    ax.set_xticklabels(names, rotation=25, ha="right", fontsize=8)
    ax.legend()

    # 4. Per-case × per-field accuracy heatmap
    ax = axes[1][1]
    data = np.array([[c["extraction"]["field_accuracy"][f]["pct"] for f in fields] for c in valid])
    im = ax.imshow(data, aspect="auto", cmap="RdYlGn", vmin=0, vmax=100)
    ax.set_xticks(range(len(fields)))
    ax.set_xticklabels(fields)
    ax.set_yticks(range(len(names)))
    ax.set_yticklabels(names, fontsize=8)
    ax.set_title("Per-Case Field Accuracy (%)")
    for i in range(len(valid)):
        for j in range(len(fields)):
            ax.text(j, i, f"{data[i, j]:.0f}", ha="center", va="center", fontsize=9, fontweight="bold")
    plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)

    plt.tight_layout()

    save_path = Path(__file__).parent / "results" / "batch_analysis.png"
    save_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(save_path, dpi=150, bbox_inches="tight")
    print(f"\nPlot saved → {save_path}")
    plt.show()


def run_batch(manifest_path: Path, save: bool = False, plot: bool = False) -> None:
    manifest = json.loads(manifest_path.read_text())
    base = manifest_path.parent
    cases = []

    for entry in manifest:
        pdf_path = base / entry["pdf"]
        if not pdf_path.exists():
            print(f"SKIP (PDF not found): {entry['pdf']}")
            continue
        if entry["valid"] and not (base / entry["groundtruth"]).exists():
            print(f"SKIP (groundtruth not found): {entry['groundtruth']}")
            continue
        cases.append(run_case(entry, base))

    _print_batch_summary(cases)

    if save:
        total = len(cases)
        class_correct = sum(1 for c in cases if c["classification_ok"])
        good = [c for c in cases if c["expected_valid"] and c.get("extraction")]
        aggregate = {"classification": {"correct": class_correct, "total": total}}
        for field in ["date", "location", "category", "amount"]:
            hits = sum(c["extraction"]["field_accuracy"][field]["hits"] for c in good)
            matched = sum(c["extraction"]["field_accuracy"][field]["matched"] for c in good)
            aggregate[field] = {"hits": hits, "matched": matched, "pct": round(hits / matched * 100, 1) if matched else 0}

        save_dir = Path(__file__).parent / "results"
        save_dir.mkdir(parents=True, exist_ok=True)
        save_path = save_dir / "batch_eval_result.json"
        save_path.write_text(json.dumps({"aggregate": aggregate, "cases": cases}, indent=2))
        print(f"\nSaved batch result → {save_path}")

    if plot:
        _plot_batch_analysis(cases)


def _save_eval_result(eval_result: dict, card_name: str, period_start: str) -> Path:
    month_name = calendar.month_name[int(period_start.split("-")[1])].lower()
    card_slug = card_name.lower().replace(" ", "_")
    save_dir = Path(__file__).parent / "results"
    save_dir.mkdir(parents=True, exist_ok=True)
    save_path = save_dir / f"{month_name}_{card_slug}_eval_result.json"
    save_path.write_text(json.dumps(eval_result, indent=2))
    return save_path


def _lookup_manifest(name: str, manifest_path: Path) -> dict | None:
    """Find a manifest entry whose PDF filename stem matches `name` (with or without .pdf)."""
    stem = Path(name).stem
    manifest = json.loads(manifest_path.read_text())
    for entry in manifest:
        if Path(entry["pdf"]).stem == stem:
            return entry
    return None


def main() -> None:
    manifest_default = Path(__file__).parent / "test_manifest.json"

    parser = argparse.ArgumentParser(description="Extract and evaluate a credit card PDF statement.")
    parser.add_argument("--file", help="Filename stem to look up in manifest (e.g. march_apple_card)")
    parser.add_argument("--card", help="Override card name from manifest")
    parser.add_argument("--save-eval", action="store_true", help="Save eval results to results/ folder")
    parser.add_argument(
        "--batch",
        action="store_true",
        help="Run all cases from test_manifest.json and print a summary table",
    )
    parser.add_argument("--plot", action="store_true", help="Plot batch analysis after --batch run")
    args = parser.parse_args()

    if args.batch:
        run_batch(manifest_default, save=args.save_eval, plot=args.plot)
        return

    if not args.file:
        parser.error("--file is required unless --batch is used")

    entry = _lookup_manifest(args.file, manifest_default)
    if not entry:
        sys.exit(f"'{args.file}' not found in test_manifest.json")

    base = manifest_default.parent
    pdf_path = base / entry["pdf"]
    card_name = args.card or entry["card"]

    if not pdf_path.exists():
        sys.exit(f"File not found: {pdf_path}")

    print(f"Extracting from {pdf_path.name} (card: {card_name}) ...")

    try:
        result, _ = extract_from_pdf(pdf_path.read_bytes(), existing_cards=[card_name])
    except ValueError as e:
        print(f"\nRejected — reason: {e}")
        return

    print(f"\nPeriod: {result.period_start} → {result.period_end}")
    print(f"Transactions extracted: {len(result.transactions)}\n")

    for i, t in enumerate(result.transactions, 1):
        loc = f" [{t.location}]" if t.location else ""
        print(f"  {i:3}. {t.date}  ${t.amount:>8}  {t.category:<18}  {t.description}{loc}")

    balance_check = check_balance(result)
    diff = balance_check["diff"]
    status = "✓ balanced" if diff == 0.0 else f"✗ diff={diff:+.2f}"
    print(f"\nStatement balance: ${balance_check['expected']:.2f}  |  Transaction sum: ${balance_check['actual']:.2f}  |  {status}")

    if entry.get("groundtruth"):
        eval_result = eval_accuracy(result, base / entry["groundtruth"], card_name)
        if args.save_eval:
            result_path = _save_eval_result(eval_result, card_name, result.period_start)
            print(f"\nSaved eval result → {result_path}")


if __name__ == "__main__":
    main()
