# Demo Guide — CC Statement Tracker

## Live App

| | URL |
|---|---|
| **Frontend (MAIN URL)** | https://finance-tracker-smoky-iota.vercel.app |
| **Backend API (Swagger)** | https://finance-tracker-f0ld.onrender.com/docs |

> **Note:** The backend runs on Render's free tier and may take up to 30 seconds to wake up after a period of inactivity. If the app hangs on first load, wait a moment and refresh.

---
## Demo Link

[Demo Youtube](https://youtu.be/OS6PvKGjmAk)

---

## Using the Live App

### 1. Sign in
- Visit https://finance-tracker-smoky-iota.vercel.app
- Click **"Sign in with Google"**
- Choose any Google account — a new user record is created automatically
- You will land on the Dashboard

### 2. Upload a statement
**NOTE**: I have provided some sample personal statements in the google drive folder linked [here](https://drive.google.com/drive/folders/19Jhdq2oeSGdaQ6eMj7sZAuF1a3PkrEqm?usp=sharing). Feel free to use those or upload your own. (The app does not store any PDFs or extracted data persistently, but you can verify that the redaction step works by uploading a statement with sensitive info and checking the redacted version before confirming the upload.) The samples consist of both good (Credit Card Statements) and bad examples (Non-credit card statements) for testing the robustness of the extraction and redaction features.
- Click the **`+ Upload`** button (bottom-right corner)
- Select a credit card PDF statement (Apple Card, Chase, or Citi work best)
- **Step 2 — Optional redaction:** drag to draw black boxes over any sensitive content (account number, name, address). Click a box to remove it. Skip this step if you prefer.
- Click **"Extract transactions →"** — Claude Haiku processes the PDF (takes ~5–10 seconds)
- **Step 3 — Review:** edit any field inline (date, description, category, amount). Add or remove rows as needed. Check that the transaction sum matches the statement balance.
- Click **"Confirm & Save"** — the dashboard and statements list update automatically

### 3. Explore
- **Dashboard (`/`)** — total spend, transaction count, and charts by category and card. Use the period selector to navigate months.
- **Statements (`/statements`)** — accordion list of all saved statements. Expand one to edit transactions inline.
- **Transactions (`/transactions`)** — flat table of all transactions with a period filter.
- **Cards (`/cards`)** — manage your list of cards (add, rename, delete).

### 4. Sign out
- Click your email in the top-right navbar → **"Sign out"**
- The session cookie is cleared and you are returned to the login page

---

## Rate Limit

Each user is limited to **10 PDF extractions per day**. The current count is shown in the upload modal header. The counter resets at midnight UTC.

---

## Local Development Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- A PostgreSQL database (Supabase free tier works — create a project and grab the pooler connection string)
- A Google Cloud OAuth 2.0 app ([console.cloud.google.com](https://console.cloud.google.com)) with `http://localhost:8000/auth/callback` in Authorized Redirect URIs
- An Anthropic API key

### 1. Clone the repo

```bash
git clone <repo-url>
cd finance-tracker
```

### 2. Create a `.env` file in the project root

```
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
COOKIE_SECRET=<run: python -c "import secrets; print(secrets.token_hex(32))">

DATABASE_URL=postgresql://user:password@host:5432/dbname

FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:8000

DAILY_UPLOAD_LIMIT=10
ENVIRONMENT=development
```

### 3. Set up and run the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend runs at `http://localhost:8000`. Swagger UI at `http://localhost:8000/docs`. Database tables are created automatically on first startup.

### 4. Set up and run the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`.

### 5. Open the app

Visit `http://localhost:5173` in your browser. Sign in with Google — the account picker will appear. After authenticating you will land on the dashboard.

---

## Running the Test Suite

```bash
source .venv/bin/activate
cd backend
python -m pytest tests/test_endpoints.py -v
```

`POST /statements/upload` is excluded from automated tests (requires a real PDF and live Anthropic API call). Test it manually via the Swagger UI.
