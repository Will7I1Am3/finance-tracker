from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from database import init_db
from deps import oauth  # noqa: F401 — registers OAuth client at import time
from routers import admin, auth, cards, redact, statements, transactions

_IS_PROD = os.environ.get("ENVIRONMENT", "development") == "production"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="CC Statement Tracker", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SessionMiddleware, secret_key=os.environ.get("COOKIE_SECRET", "dev-secret"), session_cookie="oauth_state")

app.include_router(auth.router)
app.include_router(statements.router)
app.include_router(transactions.router)
app.include_router(cards.router)
app.include_router(redact.router)
app.include_router(admin.router)

if not _IS_PROD:
    from routers import dev
    app.include_router(dev.router)
