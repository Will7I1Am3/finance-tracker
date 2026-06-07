# CC Statement Tracker — Ship with Auth + Live URL

A public-facing credit card statement tracker deployed on Render (backend) and Vercel (frontend). Upload a PDF statement, let Claude Haiku extract the transactions, review and edit them, then save to your personal dashboard. Each user's data is isolated behind Google OAuth. A daily upload cap prevents runaway LLM costs.

**Live URL:** https://finance-tracker-smoky-iota.vercel.app

**Backend API:** https://finance-tracker-f0ld.onrender.com/docs

---

## What It Does

1. Sign in with Google OAuth
2. Upload a credit card PDF statement
3. Optionally draw redaction boxes over any sensitive content (account numbers, name, address) before sending to the AI
4. Claude Haiku extracts transactions (date, merchant, category, amount)
5. Review and edit the extracted data in a table before saving
6. View your spending dashboard with charts by category and card

No raw PDFs, account numbers, card numbers, or SSNs are ever stored. The AI is instructed to ignore sensitive fields even without redaction.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI (Python) |
| Frontend | React + Vite |
| Database | PostgreSQL via Supabase |
| Hosting | Render (backend) · Vercel (frontend) |
| Auth | Google OAuth (authlib) |
| LLM | Anthropic Claude Haiku |

---

## Local Development Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- A PostgreSQL database (Supabase free tier works)
- Google OAuth credentials (from Google Cloud Console)
- Anthropic API key

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create a `.env` file in the project root:
```
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
COOKIE_SECRET=<random 32-byte hex — python -c "import secrets; print(secrets.token_hex(32))">

# PostgreSQL — get from Supabase: Project Settings → Database → URI
DATABASE_URL=postgresql://user:password@host:5432/dbname

# For local dev, use the localhost defaults below
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:8000

# Max PDF uploads per user per day (prevents runaway LLM costs)
DAILY_UPLOAD_LIMIT=10

# Set to "production" on Render (controls SameSite cookie and CORS)
ENVIRONMENT=development

# Comma-separated list of Google account emails with admin access to /admin
ADMIN_EMAILS=you@example.com
```

`COOKIE_SECRET` can be generated with:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` come from a Google Cloud Console OAuth 2.0 app. The authorized redirect URI must include `http://localhost:8000/auth/callback` for local dev (plus the Render backend URL for production).

Database tables are created automatically on first startup for new deployments. If upgrading an existing deployment, see the Supabase migration SQL in `REVIEW-PLAN.md`.

> **Warning:** There is currently only one Supabase database shared between local development and production. Any data you create, modify, or delete locally will affect the live production database. Use caution when testing destructive operations locally. Separate development and production databases will be set up after the assignment is complete.

### Frontend

```bash
cd frontend
npm install
```

---

## Running the App

You need two terminals running at the same time.

**Terminal 1 — Backend:**
```bash
source .venv/bin/activate
cd backend
uvicorn main:app --reload
# Backend runs at http://localhost:8000
# Swagger UI at http://localhost:8000/docs
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
# Frontend runs at http://localhost:5173
```

### Admin Access (Local Only)

To access the app without Google OAuth — including uploading statements and testing the full upload flow — visit:

```
http://localhost:8000/dev/admin-login
```

This is a backend route (port 8000, not 5173) — the backend sets the session cookie for a `dev@admin.local` admin user, then automatically redirects you to the frontend. You'll be logged in with full access to all features including uploading and the Admin tab. This route only exists when `ENVIRONMENT=development` and is never registered in production.

> **Note:** The Admin tab is only visible to accounts whose email is listed in the `ADMIN_EMAILS` env var (or `dev@admin.local` in development). Regular users who sign in with Google will not see the Admin tab unless explicitly granted access.

---

## Demo

**Demo video link** — https://www.youtube.com/watch?v=OS6PvKGjmAk

---

## Directory Structure

```
04-student-choice-win-assignment-4/
├── backend/
│   ├── main.py                         # FastAPI app wiring (middleware, startup, routers)
│   ├── database.py                     # PostgreSQL connection via psycopg2, schema init
│   ├── deps.py                         # OAuth client + get_current_user dependency
│   ├── models.py                       # Pydantic request/response models
│   ├── extractor.py                    # PDF → Claude → ExtractionResult
│   ├── redactor.py                     # Standalone regex-based PDF PII redactor (CLI + library)
│   ├── routers/
│   │   ├── auth.py                     # /auth/login, /callback, /logout, /me
│   │   ├── statements.py               # /statements endpoints + rate limiter
│   │   ├── transactions.py             # /transactions endpoints
│   │   ├── cards.py                    # /cards endpoints
│   │   ├── redact.py                   # /redact/preview and /redact/apply
│   │   └── admin.py                    # /admin/* endpoints (admin-only, guarded by get_admin_user)
│   └── tests/
│       ├── test_endpoints.py           # API endpoint tests
│       └── extraction_eval/
│           ├── eval.py                 # CLI: extract PDF + score vs. groundtruth
│           ├── groundtruth/            # Hand-verified truth files (5 statements)
│           ├── documents/              # Test PDFs (not committed to repo)
│           └── results/                # Saved eval output JSON + charts
├── frontend/
│   ├── index.html
│   └── src/
│       ├── main.jsx                    # React entry point
│       ├── App.jsx                     # Root component, router, auth gate, FAB + UploadModal
│       ├── AuthContext.jsx             # AuthProvider + useAuth() hook; calls /auth/me on load
│       ├── ThemeContext.jsx            # Light/dark theme state + localStorage
│       ├── SettingsContext.jsx         # Timezone preference + city list; persisted in localStorage
│       ├── DataRefreshContext.jsx      # Refresh counter; pages re-fetch when triggerRefresh() fires
│       ├── index.css                   # Global styles and CSS variables
│       ├── api/
│       │   ├── client.js               # Base fetch wrapper (credentials: include, 401 reload)
│       │   ├── statements.js
│       │   ├── transactions.js
│       │   ├── cards.js
│       │   ├── redact.js               # previewPdf + applyRedactions fetch helpers
│       │   └── admin.js                # All /admin/* fetch calls
│       ├── components/
│       │   ├── NavBar.jsx              # Top nav; theme toggle + Settings gear (timezone selector + Sign out dropdown); Admin link for admin users
│       │   ├── UploadModal.jsx         # Full-screen modal wrapper; sticky header + close guard
│       │   ├── PeriodSelector.jsx      # Shared period filter (Month/3Mo/Year/Custom) used by Dashboard, Transactions, Statements
│       │   ├── PeriodSelector.module.css
│       │   ├── StatementCard.jsx       # Single accordion row (collapsed header + edit form)
│       │   └── StatementDetail.jsx     # Expanded transaction table (edit/add/delete rows)
│       ├── pages/
│       │   ├── Login.jsx               # "Sign in with Google" screen (shown when unauthenticated)
│       │   ├── Dashboard.jsx           # Spend overview with charts
│       │   ├── Upload.jsx              # PDF upload + annotation + review (rendered inside UploadModal)
│       │   ├── Statements.jsx          # Statement list — page-level state and data fetching
│       │   ├── Transactions.jsx        # Full transaction table with period filter
│       │   ├── Cards.jsx               # Card management
│       │   └── Admin.jsx               # Admin analytics dashboard (guarded — only visible to admin accounts); all time data timezone-aware
│       └── utils/
│           └── period.js               # Shared period filter helpers
├── live_documents/                     # Personal PDFs used during development (not committed)
├── requirements.txt
└── .env.example
```

---

## Architecture

The app is split into a React frontend and a FastAPI backend. They communicate exclusively over HTTP — the browser never touches the database directly.

```
  Browser (React + Vite)
  ┌──────────────────────────────┐
  │  Google OAuth → session      │
  │  cookie set on /auth/callback│
  └──────────────┬───────────────┘
                 │  all requests carry cookie; backend verifies + filters by user_id
                 ▼
  ┌─────────────────────┐
  │  User picks a PDF   │
  └──────────┬──────────┘
             │  POST /redact/preview
             ▼
  ┌──────────────────────────────────────┐
  │  Backend renders each PDF page as    │
  │  PNG and returns base64 images       │
  └──────────────┬───────────────────────┘
                 │  pages displayed in browser canvas
                 ▼
  ┌──────────────────────────────────────┐
  │  User optionally draws redaction     │
  │  boxes over sensitive content        │
  └───────┬──────────────────────────────┘
          │ boxes drawn?
          ├─ no ──────────────────────────────────────┐
          │                                           │
          │  POST /redact/apply                       │
          ▼                                           │
  ┌─────────────────────────────┐                    │
  │  Backend burns black boxes  │                    │
  │  into PDF (pymupdf)         │                    │
  │  returns redacted PDF bytes │                    │
  └──────────────┬──────────────┘                    │
                 │                                   │
                 └──────────────┬────────────────────┘
                                │  POST /statements/upload
                                │  (redacted or original PDF)
                                ▼
  FastAPI Backend
  ┌─────────────────────────────────────┐
  │  Rate limit check (usage table)     │
  │  Is content_type == application/pdf?│
  └────────┬──────────────┬────────────┘
           │ yes          │ no
           │              └──► 400 "Only PDF files accepted"
           ▼
  ┌─────────────────────────────────────┐
  │  Encode PDF as base64               │
  │  Fetch existing card names from DB  │
  └────────────────┬────────────────────┘
                   │  document + prompt
                   ▼
         Anthropic API (Claude Haiku)
         ┌───────────────────────────┐
         │ Is this a credit card     │
         │ statement?                │
         └───────┬───────────┬───────┘
                 │ yes       │ no
                 │           └──► 400 "Not a credit card statement"
                 ▼
         ┌───────────────────────────┐
         │ Extract:                  │
         │  • card name              │
         │  • billing period         │
         │  • statement balance      │
         │  • transactions (list)    │
         └───────────┬───────────────┘
                     │  ExtractionResult JSON
                     ▼
  Browser — preview shown, nothing saved yet
  User edits / confirms
             │  POST /statements
             ▼
  ┌──────────────────────────────────────┐
  │  Save to PostgreSQL (Supabase)       │
  │  statements + transactions + cards   │
  └──────────────────────────────────────┘
```

**General CRUD flow** (all other pages — browsing, editing, deleting):

```
Browser (React + Vite)  ──►  FastAPI REST API  ──►  PostgreSQL (Supabase)
```

**Data flow for a statement upload:**

1. User picks a PDF in the Upload page.
2. Frontend POSTs to `POST /redact/preview` — the backend renders each page as a PNG and returns base64 images.
3. User optionally draws redaction boxes over sensitive content in the browser canvas. Boxes can be removed by clicking.
4. If boxes were drawn: the frontend computes `SHA-256(original PDF)` in the browser, then POSTs to `POST /redact/apply` to burn the black rectangles into the PDF via pymupdf. The original hash is kept for duplicate detection.
5. Frontend POSTs the (possibly redacted) PDF to `POST /statements/upload`, including `original_hash` if redacted.
6. The backend checks the rate limit, checks for a duplicate `(user_id, pdf_hash)` pair, fetches existing card names, and sends the PDF to Claude Haiku.
7. Claude returns JSON: card name, billing period, statement balance, and a list of transactions.
8. The backend increments the daily upload count and returns the result as a preview — nothing is saved yet.
9. The user reviews and edits the extracted transactions. On confirm, the frontend POSTs to `POST /statements`.
10. The backend checks for a duplicate (card + period) before inserting, then saves the statement and transactions.

All other interactions (editing, deleting, browsing) are standard CRUD calls to the REST API.

---

## Frontend

Built with **React + Vite**, **react-router-dom**, and **Recharts**. Supports light and dark mode (stored in `localStorage`).

The nav has four pages: Dashboard, Statements, Transactions, Cards. Upload is a floating action button (FAB) that opens a full-screen modal, keeping the flow self-contained and preventing accidental navigation mid-upload.

### Pages

**Login**
Shown when the user is not authenticated. A single "Sign in with Google" button redirects to `/auth/login`. After OAuth completes, the user is redirected back to the app and the full UI renders. The NavBar shows the user's email and a Sign out button while logged in.

**Dashboard (`/`)**
Spending overview for a selected time period. Defaults to the current month. Use the `Month / 3 Mo / Year / Custom` toggle and the `‹ ›` arrows to navigate. In Custom mode the arrows are replaced with start and end date pickers, pre-populated from the current period. Shows total spend and transaction count for the period, then two chart sections — By Card and By Category — each with a bar/pie toggle and a spend/transaction-count toggle. Clicking a card tile expands an inline transaction table for that card.

**Upload (FAB modal)**
A `+ Upload` floating action button sits fixed at the bottom-right of every page. Clicking it opens a full-screen modal overlay (same background as the app, scrollable) with a sticky header bar showing the current step and a close button. The header updates as you move through the three phases: *Step 1 of 3 — Select PDF* → *Step 2 of 3 — Optional redaction* → *Step 3 of 3 — Edit & confirm*. Closing mid-flow shows a confirmation prompt. Phase 1: pick a PDF. Phase 2: the PDF is rendered page-by-page — drag to draw black redaction boxes over any sensitive content (account numbers, name, address), click a box to remove it. Redaction is optional. Phase 3: review the LLM-extracted transactions in an editable table before confirming. The card name is auto-detected, the statement balance is editable, and rows can be added, modified, or removed. A mismatch warning appears if transaction amounts do not sum to the stated balance. A "Download redacted PDF" button is available when boxes have been drawn. On save, Dashboard, Statements, and Transactions pages re-fetch automatically — no manual refresh needed.

**Statements (`/statements`)**
Accordion list of all saved statements, sorted by billing period (most recent first). A card filter dropdown and the `Month / 3 Mo / Year / Custom` period selector (filtering on `period_start`) scope the list. Expanding a statement shows its full transaction table with inline row editing (description, category, location, amount), per-row delete, and an add-transaction form. The statement header (card, period dates, balance) is also editable inline.

**Transactions (`/transactions`)**
Flat table of all transactions in the selected period, sorted most-recent first. Same `Month / 3 Mo / Year / Custom` period selector as the Dashboard. Columns: Date, Card, Description, Category, Location, Amount. Shows a transaction count and total spend summary.

**Cards (`/cards`)**
Manage the list of credit cards. Add new cards, rename existing ones inline, or delete them. Deletion is blocked if any statements are linked to the card.

**Admin (`/admin`)** — visible only to accounts in `ADMIN_EMAILS`
Site-wide usage analytics. Shows a KPI strip (total users, total uploads, statements saved, save rate, active users this week), a 2×2 chart grid (new signups, upload activity, cost per day, cumulative cost), and a searchable/scrollable user management table. Clicking a user row expands a drill-down panel with their upload history chart, statement count, and estimated LLM cost. Admin actions: reset a user's daily upload limit, or hard-delete a user and all their data. All charts support 7d / 30d / All time toggles. The page auto-refreshes whenever a new statement is uploaded. All time-based data (chart date buckets, "uploads today", "last active", "signed up", range boundaries) respects the timezone selected in the NavBar Settings dropdown.

> **Development access:** In a local development environment (`ENVIRONMENT != "production"`), you can bypass Google OAuth and get instant admin access by visiting `http://localhost:8000/dev/admin-login`. Note: this is port 8000 (the backend), not 5173 (the frontend) — the backend must set the session cookie first, then it redirects you to the frontend automatically. This route does not exist in production.

---

## Database Schema

PostgreSQL via Supabase. Tables are created automatically on first server start via `init_db()`.

```sql
CREATE TABLE users (
    id         SERIAL PRIMARY KEY,
    google_id  TEXT NOT NULL UNIQUE,
    email      TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()    -- signup timestamp; used for admin signup chart
);

CREATE TABLE cards (
    id      SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name    TEXT NOT NULL,
    UNIQUE(user_id, name)
);

CREATE TABLE statements (
    id                SERIAL PRIMARY KEY,
    user_id           INTEGER NOT NULL REFERENCES users(id),
    card_id           INTEGER NOT NULL REFERENCES cards(id),
    period_start      DATE NOT NULL,
    period_end        DATE NOT NULL,
    pdf_hash          TEXT NOT NULL,          -- SHA-256 of the uploaded PDF
    statement_balance TEXT,                  -- total amount due, as a string
    UNIQUE(user_id, pdf_hash)                -- same PDF allowed across different users
);

CREATE TABLE transactions (
    id           SERIAL PRIMARY KEY,
    statement_id INTEGER NOT NULL REFERENCES statements(id),
    card_id      INTEGER NOT NULL REFERENCES cards(id),
    date         DATE NOT NULL,
    description  TEXT NOT NULL,
    location     TEXT NOT NULL DEFAULT '',    -- 2-letter state abbreviation or ""
    category     TEXT NOT NULL,
    amount       TEXT NOT NULL                -- positive decimal string, e.g. "12.34"
);

CREATE TABLE category_corrections (
    user_id     INTEGER NOT NULL REFERENCES users(id),
    description TEXT NOT NULL,               -- merchant description
    category    TEXT NOT NULL,               -- most recent user-assigned category
    PRIMARY KEY (user_id, description)
);

CREATE TABLE usage (
    user_id       INTEGER NOT NULL REFERENCES users(id),
    date          DATE NOT NULL,
    upload_count  INTEGER NOT NULL DEFAULT 0,
    input_tokens  INTEGER NOT NULL DEFAULT 0,   -- Claude input tokens for cost tracking
    output_tokens INTEGER NOT NULL DEFAULT 0,   -- Claude output tokens for cost tracking
    PRIMARY KEY (user_id, date)
);
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/auth/login` | Redirect to Google OAuth (with `prompt=select_account`) |
| `GET` | `/auth/callback` | Google redirects here after auth; sets signed httpOnly session cookie; redirects to frontend |
| `POST` | `/auth/logout` | Clears the session cookie |
| `GET` | `/auth/me` | Returns `{ user_id, email, is_admin }` for the current session, or 401 if not authenticated |
| `GET` | `/statements/usage` | Returns `{ used, limit }` — today's LLM extraction count vs. the daily cap for the current user |
| `GET` | `/statements` | List all statements, newest period first. Filter: `?card_name=` |
| `GET` | `/statements/{id}` | Single statement + its transactions + `transaction_sum` |
| `POST` | `/statements/upload` | PDF → LLM extraction (preview only, does not save). Accepts optional `original_hash` form field for redacted uploads. Rate limited per user per day. |
| `POST` | `/statements` | Save confirmed statement + transactions to DB. Rejected (409) if same card + period already exists. |
| `POST` | `/redact/preview` | Render each page of an uploaded PDF as a base64 PNG. Returns `{pages: [{image, width, height}]}`. Rate-limited by the daily upload quota — returns 429 if the user's limit is exhausted. |
| `POST` | `/redact/apply` | Apply redaction rectangles to a PDF and return the redacted file. Accepts `file` + `rectangles` (JSON array of `{page, x, y, w, h}` in PDF points). Rate-limited by the daily upload quota. |
| `PATCH` | `/statements/{id}` | Edit period dates, statement balance, or card name |
| `DELETE` | `/statements/{id}` | Delete statement and all its transactions |
| `POST` | `/statements/{id}/transactions` | Add a single transaction to a saved statement. Returns updated `transaction_sum` + `statement_balance` |
| `GET` | `/transactions` | List all transactions across all statements. Filter: `?card_name=` |
| `PATCH` | `/transactions/{id}` | Edit date, description, category, location, or amount. Returns updated `transaction_sum` + `statement_balance`. If `category` is changed, upserts a record into `category_corrections`. |
| `DELETE` | `/transactions/{id}` | Delete a transaction. Returns updated `transaction_sum` + `statement_balance` |
| `GET` | `/cards` | List all cards |
| `POST` | `/cards` | Add a new card. Duplicate names rejected (409) |
| `PATCH` | `/cards/{id}` | Rename a card |
| `DELETE` | `/cards/{id}` | Delete a card. Rejected (409) if statements or transactions still reference it |
| `GET` | `/admin/stats?tz=` | KPI strip: total users, statements, uploads, active this week, save rate. `tz` = IANA timezone (default UTC). Admin only. |
| `GET` | `/admin/users?search=&tz=` | Per-user table with optional email search. Dates bucketed in `tz`. Admin only. |
| `GET` | `/admin/activity?range=7d\|30d\|all&tz=` | Site-wide uploads per day bucketed in `tz`. Admin only. |
| `GET` | `/admin/signups?range=7d\|30d\|all&tz=` | New user registrations per day bucketed in `tz`. Admin only. |
| `GET` | `/admin/users/{id}/activity?range=&tz=` | Per-user upload history bucketed in `tz`. Admin only. |
| `POST` | `/admin/users/{id}/reset-usage` | Zero out a user's upload count for today. Admin only. |
| `DELETE` | `/admin/users/{id}` | Hard delete a user and all their data (cascades through all tables). Admin only. |

`PATCH /transactions/{id}` always returns the current `transaction_sum` alongside the updated transaction so the frontend can surface a mismatch warning if the sum no longer equals `statement_balance`. The API does not block mismatched saves — it only flags them.

`PATCH /statements/{id}` syncs `transactions.card_id` whenever the statement's card is changed, keeping both tables consistent. `DELETE /cards/{id}` guards against both `statements.card_id` and `transactions.card_id` references to avoid FK violations.

> **Note:** Category corrections are only recorded when editing a transaction already saved in the database (via `PATCH /transactions/{id}`). Category changes made during the upload preview are not recorded.

---

## Protections

Several extra safeguards were added beyond the core feature set:

**Stale session detection**
`get_current_user` (in `deps.py`) verifies the `user_id` from the session cookie against the `users` table on every authenticated request. If the row no longer exists (e.g. after a database wipe or user deletion), the endpoint returns 401 immediately — the frontend reloads and the login page appears rather than returning empty or broken data.

**OAuth state mismatch handling**
If Google's OAuth callback arrives with a state that doesn't match the session (e.g. the user clicked sign-in twice, used the back button mid-flow, or had a stale browser cookie), authlib raises a `MismatchingStateError`. Previously this caused a 500. It is now caught in `/auth/callback` and redirects back to the frontend gracefully so the user can try again.

**Required date fields throughout**
The LLM is instructed to return empty strings rather than fabricate dates it cannot read (e.g. if the billing period was redacted). The review UI enforces that all date fields — billing period start/end and every transaction date — are filled in before saving is allowed. The same enforcement applies in the Statements edit flow: period date inputs are `type="date"` pickers and the Save button is disabled until both are filled. Transaction date is also editable (and required) when editing or adding a row inline.

**Upload count display**
The upload modal fetches `GET /statements/usage` on open and after each extraction, showing the user their current daily count (e.g. `3 / 10 uploads today`). The counter turns amber at 2 remaining and red at 0, so users are warned before hitting the rate limit.

---

## Extractor

`backend/extractor.py` is the LLM extraction layer. It is a pure library — no CLI, no side effects. The FastAPI upload endpoint and the eval CLI both call it directly.

**What it does:**

1. Accepts raw PDF bytes, an optional list of existing card names, and an optional list of category corrections.
2. Base64-encodes the PDF and computes a SHA-256 hash (used later as the duplicate-upload key).
3. Sends the PDF to **Claude Haiku** via the Anthropic API as a document message alongside a structured prompt.
4. The prompt instructs Claude to validate that the document is a credit card statement, then extract: the card name, billing period dates, statement balance, and all purchase transactions — each with date, merchant description, state abbreviation, category, and amount. If category corrections exist, they are injected as few-shot rules so the LLM prefers the user-confirmed category for matching descriptions.
5. Payments, credits, and balance-reducing entries are explicitly excluded.
6. Installment plan items (Apple Card, Chase My Chase Plan, Citi Flex Pay) are included as `Installments` category transactions, with the installment amount for the current period and the purchase date shifted to the billing period's month.
7. Claude returns raw JSON. The extractor strips any accidental markdown code fences, parses it, and returns a typed `ExtractionResult` Pydantic object.
8. If Claude identifies the document as not a credit card statement, a `ValueError` is raised, which the API converts to a 400 response.

**Fixed categories:**
`Food`, `Groceries`, `Shopping`, `Gas`, `Transportation`, `Entertainment`, `Travel`, `Health/Medical`, `Subscriptions`, `Installments`, `Misc`

**Privacy:** The prompt explicitly tells Claude not to extract or include account numbers, card numbers, SSNs, full name on account, routing numbers, or credit limits.

---

## Testing

### API Endpoint Tests

```bash
source .venv/bin/activate
cd backend
python -m pytest tests/test_endpoints.py -v
```

`POST /statements/upload` is excluded from automated tests because it requires a real PDF and a live Anthropic API call. Test it manually via the Swagger UI at `http://localhost:8000/docs`.

### LLM Extraction Evaluation

`backend/tests/extraction_eval/eval.py` is a CLI that runs a real PDF through the extractor and scores the output against a hand-verified groundtruth file.

> **Note:** The `documents/` folder is not committed — it contains personal credit card PDFs. To run the eval you need your own PDF statements.

```bash
python tests/extraction_eval/eval.py --file documents/february_chase_card.pdf
python tests/extraction_eval/eval.py --file documents/march_apple_card.pdf --save-eval

# Run all cases from the manifest
python tests/extraction_eval/eval.py --batch
python tests/extraction_eval/eval.py --batch --save-eval
```

**Evaluation metrics:**

| Check | Description |
|-------|-------------|
| Valid PDF | Only valid credit card bill statement PDFs are processed |
| Transaction count | Number of extracted transactions vs. expected |
| Field accuracy | Per-field match rate for date, description, location, category, and amount |
| Period dates | `period_start` and `period_end` match the billing cycle on the statement |
| Statement balance | Extracted balance matches the groundtruth value |
| Balance check | Sum of all transaction amounts equals the statement balance |

**Results:**

| Statement | Transactions | Period dates | Balance | Date | Location | Category | Amount |
|-----------|:-----------:|:------------:|:-------:|:----:|:--------:|:--------:|:------:|
| Chase — Feb 2026 | 6 / 6 ✓ | ✓ | ✓ | 100% | 100% | 83.3% | 100% |
| Citi — Feb 2026 | 14 / 14 ✓ | ✓ | ✓ | 100% | 100% | 100% | 100% |
| Apple — Mar 2026 | 19 / 19 ✓ | ✓ | ✓ | 100% | 100% | 100% | 100% |
| Chase — Mar 2026 | 10 / 10 ✓ | ✓ | ✓ | 100% | 100% | 100% | 100% |
| Citi — Mar 2026 | 16 / 16 ✓ | ✓ | ✓ | 100% | 100% | 93.8% | 100% |
| **Aggregate** | **65 / 65** | **10 / 10** | **4 / 5** | **100%** | **100%** | **96.9%** | **100%** |

The eval also tested 5 non-credit-card documents (bank statements, savings account, academic PDF) — all 5 were correctly rejected.

---

## AI Transcripts

The AI transcripts for this assignment are in the `transcripts/` folder.

---

## Assignment 4: Student Choice

See the [assignment page](https://ucsd-cse-115-215.github.io/sp26/assignments/a4-assignment.html) for full requirements.
