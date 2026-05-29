# CC Statement Tracker on Railway (Ship with Auth + Live URL)

**One-sentence description:** Credit card statement tracker deployed to a public HTTPS URL with Google OAuth, per-user data isolation, and a cost ceiling on LLM usage (Ship with auth + live URL).

**Past project reference:** Assignment 2 — CC Statement Tracker.
GitHub: https://github.com/ucsd-cse-genai-programming-sp26/02-doc-scanner-win-assignment-2

---

## Planned Technologies

- **Backend:** FastAPI (Python) — ✅ Implemented. Entry point at `backend/main.py`; routers in `backend/routers/`.
- **Frontend:** React + Vite — ✅ Implemented. Source in `frontend/src/`; pages, components, and API layer all built out.
- **Database:** PostgreSQL via Supabase (replacing SQLite) — ✅ Implemented. `backend/database.py` connects via `DATABASE_URL` env var using psycopg2. Tables created automatically on startup.
- **Hosting:** Railway (backend + frontend) — ⚠️ Changed and Implemented. Railway was dropped because it requires a paid plan after the initial trial credit. The backend is now hosted on **Render** (`https://finance-tracker-f0ld.onrender.com`) and the frontend on **Vercel** (`https://finance-tracker-smoky-iota.vercel.app`).
- **Auth:** Google OAuth — ✅ Implemented. `backend/routers/auth.py` handles the OAuth flow; `backend/deps.py` verifies the signed session cookie on every protected request.
- **LLM:** Anthropic Claude Haiku — ✅ Implemented. `backend/extractor.py` sends the PDF as a base64-encoded document block to Claude Haiku and parses the structured JSON response.
- **Rate limiting:** Per-user upload counter stored in Postgres — ✅ Implemented. `POST /statements/upload` in `backend/routers/statements.py` checks the `usage` table before calling the LLM and increments the count after. Cap is set to 10 uploads per user per day via the `DAILY_UPLOAD_LIMIT` env var.
- **Secrets:** Railway environment variables — ⚠️ Changed and Implemented. Secrets are now stored as environment variables in the **Render** dashboard instead of Railway. All sensitive config (Anthropic key, Google OAuth credentials, cookie secret, database URL) is set there and never committed to the repo.

---

## First Deliverable

The main goal of the first deliverable is to ship the current implementation of the credit card statement tracker to a public HTTPS URL on Railway, with Google OAuth authentication and per-user rate limiting.

This will involve deploying the backend and frontend to Railway, configuring Google OAuth with the correct redirect URIs, setting up the Postgres database connection rather than SQLite, and implementing a per-user rate limiter to block uploads once a daily cap is hit. 

Focused User Story: As a user, I want to be able to visit the public URL, log in with my Google account, and upload my credit card statement to view my transactions, with a clear limit on how many uploads I can do per day. If I exceed the daily limit, I want to be informed that I have reached the cap and cannot upload any more statements until the next day. I also want to be able to see my spending dashboard once the transactions are extracted and confirmed.

Aside: I will also add a redacting function to the PDF extractor to remove sensitive information from the statements before any extraction. This will be done through programatically to avoid exposing personal data in the extracted transactions.

> **Status:** ✅ Implemented. The app is live at `https://finance-tracker-smoky-iota.vercel.app`. ⚠️ Railway was replaced by **Render** (backend) and **Vercel** (frontend) — see Planned Technologies note above.
>
> **User story:** ✅ Accomplished. Users can visit the live URL, sign in with Google, upload a statement, and view extracted transactions on the dashboard. The daily upload counter is shown in the upload modal header and turns amber/red as the limit approaches.
>
> **Redaction aside:** ⚠️ Approach changed. Rather than programmatically stripping fields automatically, a canvas-based tool was built into the upload flow (Step 2 of 3). Users draw black boxes over any content they want removed, can download the redacted PDF to verify it, and then send it for extraction. This gives users full control rather than relying on pattern matching that can miss edge cases.

---

## Rough Architecture for First Deliverable

1. **Google OAuth Login** — When a user visits the site and clicks "Sign in with Google", they are redirected to Google to authenticate. On success, Google sends them back to the backend, which creates a signed session cookie tied to their account and redirects them to the dashboard. The redirect URI in Google Cloud Console needs to be updated from localhost to the Railway domain.

   > ✅ Implemented. Handled in `backend/routers/auth.py`. ⚠️ The redirect URI was updated to the **Render** backend URL (`https://finance-tracker-f0ld.onrender.com/auth/callback`) instead of a Railway domain.

2. **Session Verification** — Every request to a protected endpoint passes through a check that reads the session cookie and confirms it is valid. If it is, the user's ID is extracted and passed to the handler. If not, the request is rejected with a 401. This already exists in `deps.py` but we must ensure the cookie secret is set in Railway's environment variables.

   > ✅ Implemented. `get_current_user` in `backend/deps.py` verifies the signed session cookie on every protected request and implements a 30-minute sliding inactivity timeout. ⚠️ `COOKIE_SECRET` is stored in **Render** environment variables, not Railway.

3. **PDF Redactor** — Before a statement is processed, sensitive fields (account numbers, card numbers, full name, SSN) are programmatically stripped from the PDF. This ensures personal data never reaches LLM or gets logged anywhere. Takes raw PDF bytes, returns a cleaned version.

   > ⚠️ Approach changed and Implemented. Rather than automatic programmatic stripping, a canvas-based redaction tool was built into Step 2 of the upload flow (`frontend/src/pages/Upload.jsx`, `backend/routers/redact.py`). Users draw black boxes over any content they want removed and can download the redacted PDF before sending it for extraction. This gives users full control rather than relying on regex pattern matching that can miss edge cases.

4. **Rate Limiter** — Before making a Claude API call, the backend checks how many uploads the user has made today against a `usage` table in Postgres. If they have hit the daily cap (default 10), the upload is blocked and the user is told when the limit resets. If not, the count is incremented and the upload proceeds.

   > ✅ Implemented as written. Logic lives in `POST /statements/upload` in `backend/routers/statements.py`. The cap is configurable via the `DAILY_UPLOAD_LIMIT` env var. The current count is also shown in the upload modal header with a color warning at ≤2 remaining.

5. **PDF Extractor** — The cleaned PDF is sent to the LLM along with the user's existing card names and any category corrections. LLM returns the card name, billing period, statement balance, and a list of transactions. This already exists in `extractor.py` so no logic changes.

   > ✅ Implemented as written. `backend/extractor.py` is unchanged in its core logic. The PDF is base64-encoded and sent to Claude Haiku as a native document block.

6. **Statement Store** — Once the user reviews and confirms the extracted transactions, they are saved to Postgres. This is the existing `POST /statements` endpoint. The only change is swapping SQLite for Postgres by pointing `database.py` at the `DATABASE_URL` env var from Railway.

   > ✅ Implemented as written. `backend/database.py` uses `DATABASE_URL` pointing to the Supabase PostgreSQL instance. ⚠️ The env var is set in **Render**, not Railway.

7. **Frontend** — The React app is built with `npm run build` and deployed as a separate Railway service. The backend URL in `client.js` is updated from `localhost:8000` to the live Railway backend domain. CORS on the backend is updated to allow requests from the Railway frontend domain.

   > ✅ Implemented. ⚠️ Deployed to **Vercel** instead of Railway. `frontend/src/api/client.js` reads the backend URL from `VITE_API_URL` (set to the Render backend URL at Vercel build time). CORS on the backend allows requests from the Vercel frontend domain via the `FRONTEND_URL` env var.

8. **Secrets** — All sensitive config (LLM API key, Google OAuth credentials, cookie secret, database URL, daily upload limit) is stored as Railway environment variables instead of a local `.env` file.

   > ✅ Implemented. ⚠️ Stored in **Render** environment variables instead of Railway. The frontend's only build-time secret (`VITE_API_URL`) is set in **Vercel** environment variables.

**Data:**

- All existing tables (`users`, `cards`, `statements`, `transactions`, `category_corrections`) migrated to Postgres via Supabase — same schema, no structural changes.
- New table: `usage (user_id INTEGER, date DATE, upload_count INTEGER, PRIMARY KEY (user_id, date))` for rate limiting.

---

## After First Deliverable Goals

- **Admin analytics view:** A protected `/admin` page (restricted to my email) showing per-user upload counts, total uploads over time, and active user counts — basic usage analytics to see how people are interacting with the site.

  > Planned for next deliverable. The goal is to build a protected admin page visible only to my account (or any approved test accounts) that shows usage analytics — who is using the app, how often, and what they are uploading. This will help understand user behavior and inform future decisions on rate limits and features.

- **Onboarding for new users:** First-time users see a guided empty state explaining what to upload and how the app works, rather than landing on a blank dashboard.

  > ❌ No longer planned. Not a priority for the next deliverable.

- **Mobile layout:** The current UI is desktop-only. Improve the upload and dashboard pages to be usable on a phone screen.

  > ❌ No longer planned. Not a priority for the next deliverable.

- **Debit card statement support:** Expand the scope of this project to handle debit card and bank account statements in addition to credit card statements, broadening what users can track.

  >  Future plan, not for next deliverable. Debit card and bank statement support is a meaningful expansion but requires more work on the extraction prompt and category system. Will revisit after the admin page is built.
