# CC Statement Tracker on Railway (Ship with Auth + Live URL)

**One-sentence description:** Credit card statement tracker deployed to a public HTTPS URL with Google OAuth, per-user data isolation, and a cost ceiling on LLM usage (Ship with auth + live URL).

**Past project reference:** Assignment 2 — CC Statement Tracker.
GitHub: https://github.com/ucsd-cse-genai-programming-sp26/02-doc-scanner-win-assignment-2

---

## Planned Technologies

- **Backend:** FastAPI (Python)
- **Frontend:** React + Vite
- **Database:** PostgreSQL via Supabase (replacing SQLite)
- **Hosting:** Railway (backend + frontend)
- **Auth:** Google OAuth
- **LLM:** Anthropic Claude Haiku (currently)
- **Rate limiting:** Per-user upload counter stored in Postgres; blocks once a daily cap is hit (maybe 10 uploads/per day/per user to start; right now $0.01 per upload)
- **Secrets:** Railway environment variables rather than .env file(Anthropic key, Google OAuth credentials, cookie secret)

---

## First Deliverable

The main goal of the first deliverable is to ship the current implementation of the credit card statement tracker to a public HTTPS URL on Railway, with Google OAuth authentication and per-user rate limiting.

This will involve deploying the backend and frontend to Railway, configuring Google OAuth with the correct redirect URIs, setting up the Postgres database connection rather than SQLite, and implementing a per-user rate limiter to block uploads once a daily cap is hit. 

Focused User Story: As a user, I want to be able to visit the public URL, log in with my Google account, and upload my credit card statement to view my transactions, with a clear limit on how many uploads I can do per day. If I exceed the daily limit, I want to be informed that I have reached the cap and cannot upload any more statements until the next day. I also want to be able to see my spending dashboard once the transactions are extracted and confirmed.

Aside: I will also add a redacting function to the PDF extractor to remove sensitive information from the statements before any extraction. This will be done through programatically to avoid exposing personal data in the extracted transactions.

---

## Rough Architecture for First Deliverable

1. **Google OAuth Login** — When a user visits the site and clicks "Sign in with Google", they are redirected to Google to authenticate. On success, Google sends them back to the backend, which creates a signed session cookie tied to their account and redirects them to the dashboard. The redirect URI in Google Cloud Console needs to be updated from localhost to the Railway domain.

2. **Session Verification** — Every request to a protected endpoint passes through a check that reads the session cookie and confirms it is valid. If it is, the user's ID is extracted and passed to the handler. If not, the request is rejected with a 401. This already exists in `deps.py` but we must ensure the cookie secret is set in Railway's environment variables.

3. **PDF Redactor** — Before a statement is processed, sensitive fields (account numbers, card numbers, full name, SSN) are programmatically stripped from the PDF. This ensures personal data never reaches LLM or gets logged anywhere. Takes raw PDF bytes, returns a cleaned version.

4. **Rate Limiter** — Before making a Claude API call, the backend checks how many uploads the user has made today against a `usage` table in Postgres. If they have hit the daily cap (default 10), the upload is blocked and the user is told when the limit resets. If not, the count is incremented and the upload proceeds.

5. **PDF Extractor** — The cleaned PDF is sent to the LLM along with the user's existing card names and any category corrections. LLM returns the card name, billing period, statement balance, and a list of transactions. This already exists in `extractor.py` so no logic changes.

6. **Statement Store** — Once the user reviews and confirms the extracted transactions, they are saved to Postgres. This is the existing `POST /statements` endpoint. The only change is swapping SQLite for Postgres by pointing `database.py` at the `DATABASE_URL` env var from Railway.

7. **Frontend** — The React app is built with `npm run build` and deployed as a separate Railway service. The backend URL in `client.js` is updated from `localhost:8000` to the live Railway backend domain. CORS on the backend is updated to allow requests from the Railway frontend domain.

8. **Secrets** — All sensitive config (LLM API key, Google OAuth credentials, cookie secret, database URL, daily upload limit) is stored as Railway environment variables instead of a local `.env` file.

**Data:**

- All existing tables (`users`, `cards`, `statements`, `transactions`, `category_corrections`) migrated to Postgres via Supabase — same schema, no structural changes.
- New table: `usage (user_id INTEGER, date DATE, upload_count INTEGER, PRIMARY KEY (user_id, date))` for rate limiting.

---

## After First Deliverable Goals

- **Admin analytics view:** A protected `/admin` page (restricted to my email) showing per-user upload counts, total uploads over time, and active user counts — basic usage analytics to see how people are interacting with the site.
- **Onboarding for new users:** First-time users see a guided empty state explaining what to upload and how the app works, rather than landing on a blank dashboard.
- **Mobile layout:** The current UI is desktop-only. Improve the upload and dashboard pages to be usable on a phone screen.
- **Debit card statement support:** Expand the scope of this project to handle debit card and bank account statements in addition to credit card statements, broadening what users can track.
