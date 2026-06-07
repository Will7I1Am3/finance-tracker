# Regrets

## Things I Wish I'd Gotten To

**Full finance coverage across account types**

The app only handles credit cards. I really wanted to extend it to debit cards and savings accounts so the full picture of someone's finances — spending, saving, and cash flow — lives in one place. Credit cards are a natural starting point since the PDF format is consistent and the statement structure is predictable, but the more useful product would cover every account type a person actually uses. A future engineer picking this up should treat the current category system and extraction pipeline as a starting point — debit and savings statements have different fields (running balance, deposits, withdrawals) that would require a separate extraction schema and likely new categories.

## Where Time Was Wasted

**LLM prompt engineering and guardrails**

The single biggest time sink was figuring out what to tell the LLM to extract and, more importantly, what to explicitly tell it to ignore. The first versions of the extractor included refunds, reward redemptions, payments, and credits — none of which contribute to the statement balance — which caused balance mismatches on almost every upload. Getting the prompt to consistently skip those entries while still catching installment plans, which look similar but do count, took many iterations. The guardrails around sensitive fields (account numbers, names, SSNs) also needed explicit negative instruction — just saying "extract transactions" was not enough.

## Advice for a Future Engineer

- **Invest in an eval dataset early.** The extraction eval (`backend/tests/extraction_eval/`) was built late. Having ground truth files from the start would have caught prompt regressions immediately instead of discovering them manually during testing.
- **Be explicit in the LLM prompt about what NOT to extract.** Listing exclusions (payments, credits, reward-paid purchases, negative amounts) as hard rules in the prompt is more reliable than hoping the model infers them from context.
- **Separate the extraction schema by account type.** Credit card statements have a balance to reconcile against. Debit and savings do not — they have running balances and two-directional flows. Trying to force them into the same schema will create more problems than it solves.
- **The redaction canvas adds trust but also complexity.** It was worth building, but the PDF-to-canvas coordinate mapping and the duplicate detection across original and redacted versions of the same file were subtle. Document that logic carefully before touching it.
