# Review Plan

---

# Staff Review

Feedback from CSE 190/291 TA review (June 2026).

## 1. Apply daily upload limit to `/redact/preview` and `/redact/apply`

Currently the rate limit only guards `POST /statements/upload` (the LLM extraction step). The two redaction endpoints are unprotected, allowing the limit to be bypassed.

**Status**: Done — added `_check_upload_limit()` helper in `backend/routers/redact.py` that checks today's usage count against `DAILY_UPLOAD_LIMIT`; called at the top of both endpoints, returns 429 if limit is reached. The PDF load (preview) is the practical gate — users can't start the redaction flow at all if their quota is exhausted.

---

## 2. Allow custom date ranges in the spending view

The Transactions page period selector only supports predefined ranges. Users should be able to enter arbitrary start/end dates to filter their spending.

**Status**: Done — extracted a shared `PeriodSelector` component (`frontend/src/components/PeriodSelector.jsx`) with Month / 3 Mo / Year / Custom modes; Custom mode replaces the nav arrows with two date inputs pre-populated from the current period bounds. Applied uniformly to Dashboard, Transactions, and Statements pages. All filtering is client-side.

---

## 3. Make it explicit in the UI that PDF blackboxing runs client-side

Users may assume the redaction step sends their PDF to a server or AI. The UI should clearly communicate that drawing redaction boxes and downloading the redacted PDF happens entirely in the browser — no data leaves the device at that stage.

**Status**: Done — redaction is intentionally server-side; the backend handles all business logic and file processing while the client is purely responsible for rendering the interface and displaying data to the user. PyMuPDF properly burns pixels and strips the underlying text layer, which browser-side libraries cannot do as reliably. The UI infoBar in `frontend/src/pages/Upload.jsx` now explicitly states that no AI is involved in this step — redaction is handled by a PDF library on the server, and anything blacked out is never seen by the AI.

---

## 4. Support image files (JPG/PNG) for statements/receipts

The upload flow currently only accepts PDFs. Users should be able to upload JPG or PNG images of statements or receipts and have them processed the same way.

**Status**: To do

---

## 5. Ship the admin analytics view

The admin analytics dashboard is built and guarded behind `is_admin`, but was flagged as "planned" in the review. Confirm it is fully functional and visible to the reviewer.

**Status**: To do

---

## Feedback & Response

- **Same PDF blocked across users**

  The duplicate detection check on `pdf_hash` was a global unique constraint, so two different users uploading the same PDF statement were blocked with a 409 conflict — even though their data is completely isolated.

  Fixed by adding `user_id` directly to the `statements` table and changing the constraint to `UNIQUE(user_id, pdf_hash)`. Both duplicate checks in `routers/statements.py` now filter by `user_id`, and the INSERT includes `user_id`. A Supabase migration is required to drop the old global constraint and add the new composite one.

- **Extractor includes non-contributing transactions**

  The LLM extractor was pulling in refunds (negative-amount entries) and purchases paid entirely with rewards/points. These do not contribute to the statement balance, so including them inflated the transaction sum and caused balance mismatches on every upload with rewards or returns.

  Fixed by rewriting the extraction strategy in `extractor.py`: the LLM now works toward matching the statement balance starting from the primary purchases section, only pulls in supplementary sections (e.g. installment plans) if needed to reach it, skips any section whose items were paid by rewards/points, and hard-skips any line item with a negative dollar amount. The previous prompt only said to format amounts as positive strings, which caused the LLM to convert negatives to positives and keep them rather than skipping them entirely.
