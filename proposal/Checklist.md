# CC Statement Tracker on Railway — Marked-Up Proposal

> **Key:** **(a) implemented** = in the code now, with pointer; **(b) planned** = not yet done, where it would go; **(c) dropped** = no longer planned.

---

## Planned Technologies

- **Backend: FastAPI (Python)**
  **(a) Implemented.** `backend/main.py` — FastAPI app, all routers wired in, CORS middleware configured.

- **Frontend: React + Vite**
  **(a) Implemented.** `frontend/` — full React + Vite SPA with react-router-dom, Recharts, CSS Modules.

- **Database: PostgreSQL via Supabase**
  **(a) Implemented.** `backend/database.py` — uses `psycopg2` + `DATABASE_URL` env var (pointing at Supabase). `RealDictCursor` used so rows behave as dicts throughout.

- **Hosting: Railway (backend + frontend)**
  **(a) Implemented.** Backend and frontend are each deployed as separate Railway services. `FRONTEND_URL` / `BACKEND_URL` env vars consumed in `backend/main.py` (CORS) and `backend/routers/auth.py` (callback URL).

- **Auth: Google OAuth**
  **(a) Implemented.** `backend/routers/auth.py` — `/auth/login` redirects to Google, `/auth/callback` exchanges the code for a token and sets a signed httpOnly cookie. `backend/deps.py` — `get_current_user` reads and re-signs the cookie on every request (30-min sliding session).

- **LLM: Anthropic Claude Haiku**
  **(a) Implemented.** `backend/extractor.py` line 95 — `model="claude-haiku-4-5-20251001"`.

- **Rate limiting: per-user upload counter in Postgres**
  **(a) Implemented.** `backend/routers/statements.py` lines 13, 38–46, 93–134 — `DAILY_UPLOAD_LIMIT` env var (default 10); `usage` table checked before every LLM call, incremented after; returns 429 if over limit. `GET /statements/usage` returns `{used, limit}` for the frontend counter in the upload modal.

- **Secrets: Railway environment variables**
  **(a) Implemented.** All sensitive config (`DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `COOKIE_SECRET`, `ANTHROPIC_API_KEY`, `DAILY_UPLOAD_LIMIT`, `FRONTEND_URL`, `BACKEND_URL`, `VITE_API_URL`) stored as Railway env vars, not in a committed `.env` file.

---

## First Deliverable

**Goal: ship to Railway with Google OAuth and per-user rate limiting.**
**(b) Not Implemented yet.** The app is live on Railway. Users visit the public URL, sign in with Google, upload statements with a daily cap enforced, and see their spending dashboard.

**PDF redaction aside** — **(a) Implemented, but evolved.** The proposal mentioned programmatic stripping before LLM processing. What shipped is a two-track approach:
- `backend/redactor.py` — the originally proposed standalone regex/PyMuPDF redactor (usable as a CLI: `python redactor.py in.pdf out.pdf`), but not wired into the main upload flow.
- `backend/routers/redact.py` + `frontend/src/components/UploadModal.jsx` — the user-facing approach: user draws redaction boxes on a canvas in the browser (pages rendered via `POST /redact/preview`); `POST /redact/apply` burns them in. This replaced the automatic approach because user-controlled redaction is more precise and the regex approach was impractical for varied statement formats.

---

## Rough Architecture for First Deliverable

1. **Google OAuth Login**
   **(a) Implemented.** `backend/routers/auth.py` — `GET /auth/login` triggers `oauth.google.authorize_redirect` with `prompt="select_account"` so the account picker always appears. Callback URI is set to `{BACKEND_URL}/auth/callback`, updated in Google Cloud Console to the Railway domain.

2. **Session Verification**
   **(a) Implemented.** `backend/deps.py` — `get_current_user` reads the `session` cookie, verifies it with `URLSafeTimedSerializer` (max age 30 min), re-signs and resets it on every request to slide the timeout. Also does a `SELECT 1 FROM users WHERE id = %s` check so deleted users get a 401 immediately.

3. **PDF Redactor**
   **(a) Implemented, approach changed.** See "PDF redaction aside" above. The proposed automatic programmatic stripping exists in `backend/redactor.py` but is a standalone tool. The shipped user-facing flow is canvas-driven: `backend/routers/redact.py` (preview + apply endpoints), `frontend/src/components/UploadModal.jsx` (canvas annotation phase).

4. **Rate Limiter**
   **(a) Implemented.** `backend/routers/statements.py` lines 93–100 (check), 133–134 (increment). `usage` table: `(user_id, date, upload_count)` with `ON CONFLICT DO UPDATE`. Returns HTTP 429 when over limit.

5. **PDF Extractor**
   **(a) Implemented.** `backend/extractor.py` — unchanged from Assignment 2 except model pin. Receives cleaned PDF bytes + user's card names + category corrections; returns card name, billing period, statement balance, and transaction list.

6. **Statement Store**
   **(a) Implemented.** `backend/routers/statements.py` — `POST /statements` saves confirmed statement + transactions to Postgres. `backend/database.py` points at `DATABASE_URL` (Supabase). Duplicate detection on `pdf_hash` and `(card_id, period_start, period_end)`.

7. **Frontend**
   **(a) Implemented.** Built with `npm run build`, deployed as a separate Railway service. `VITE_API_URL` build-time env var points `frontend/src/api/client.js` at the Railway backend domain. CORS in `backend/main.py` allows only `FRONTEND_URL`.

8. **Secrets**
   **(b) Not yetImplemented.** All secrets are Railway env vars. No `.env` file committed.

**Data — existing tables in Postgres:**
**(a) Implemented.** `users`, `cards`, `statements`, `transactions`, `category_corrections` all created via `CREATE TABLE IF NOT EXISTS` in `backend/database.py` `init_db()`. No manual migration needed.

**Data — `usage` table:**
**(a) Implemented.** `usage (user_id INTEGER, date DATE, upload_count INTEGER, PRIMARY KEY (user_id, date))` created in `init_db()`, used in `backend/routers/statements.py`.

---

## After First Deliverable Goals

- **Admin analytics view** (protected `/admin` page with per-user upload counts)
  **(b) Planned.** Not implemented yet; allow admin to see usage stats to understand user behavior.

- **Onboarding for new users** (guided empty state for first-time users)
  **(b) Planned.** Not implemented yet; just a simple walkthrough or maybe a user guide.

- **Mobile layout** (responsive upload and dashboard)
  **(c) No longer planned.** UI remains desktop-only.

- **Debit card / bank account statement support**
  **(c) No longer planned.** Scope stayed at credit cards only for now.
