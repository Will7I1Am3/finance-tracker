# Review Plan

Feedback received from review day (June 2) and staff feedback (June 3), along with planned fixes and features in response.

## Feedback & Response

- **Same PDF blocked across users**

  The duplicate detection check on `pdf_hash` was a global unique constraint, so two different users uploading the same PDF statement were blocked with a 409 conflict — even though their data is completely isolated.

  Fixed by adding `user_id` directly to the `statements` table and changing the constraint to `UNIQUE(user_id, pdf_hash)`. Both duplicate checks in `routers/statements.py` now filter by `user_id`, and the INSERT includes `user_id`. A Supabase migration is required to drop the old global constraint and add the new composite one.

- **Extractor includes non-contributing transactions**

  The LLM extractor was pulling in refunds (negative-amount entries) and purchases paid entirely with rewards/points. These do not contribute to the statement balance, so including them inflated the transaction sum and caused balance mismatches on every upload with rewards or returns.

  Fixed by rewriting the extraction strategy in `extractor.py`: the LLM now works toward matching the statement balance starting from the primary purchases section, only pulls in supplementary sections (e.g. installment plans) if needed to reach it, skips any section whose items were paid by rewards/points, and hard-skips any line item with a negative dollar amount. The previous prompt only said to format amounts as positive strings, which caused the LLM to convert negatives to positives and keep them rather than skipping them entirely.
