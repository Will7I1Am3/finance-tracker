import os

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from itsdangerous import URLSafeTimedSerializer
from starlette.responses import Response

from database import get_connection
from deps import SESSION_MAX_AGE, get_current_user, oauth

router = APIRouter(prefix="/auth", tags=["auth"])

_FRONTEND = os.environ.get("FRONTEND_URL", "http://localhost:5173")
_BACKEND = os.environ.get("BACKEND_URL", "http://localhost:8000")
_CALLBACK = f"{_BACKEND}/auth/callback"


@router.get("/login")
async def login(request: Request):
    return await oauth.google.authorize_redirect(request, _CALLBACK, prompt="select_account")


@router.get("/callback")
async def callback(request: Request):
    if request.query_params.get("error"):
        return RedirectResponse(url=_FRONTEND)

    token = await oauth.google.authorize_access_token(request)
    userinfo = token.get("userinfo")

    conn = get_connection()
    conn.execute(
        "INSERT INTO users (google_id, email) VALUES (%s, %s) ON CONFLICT (google_id) DO NOTHING",
        (userinfo["sub"], userinfo["email"]),
    )
    conn.commit()
    user = conn.execute(
        "SELECT id, email FROM users WHERE google_id = %s", (userinfo["sub"],)
    ).fetchone()
    conn.close()

    _is_prod = os.environ.get("ENVIRONMENT", "development") == "production"
    session_token = URLSafeTimedSerializer(os.environ.get("COOKIE_SECRET", "")).dumps(
        {"user_id": user["id"], "email": user["email"]}
    )
    response = RedirectResponse(url=_FRONTEND)
    response.set_cookie(
        "session", session_token,
        httponly=True,
        samesite="none" if _is_prod else "lax",
        secure=_is_prod,
        max_age=SESSION_MAX_AGE,
    )
    return response


@router.post("/logout")
def logout(response: Response):
    _is_prod = os.environ.get("ENVIRONMENT", "development") == "production"
    response.delete_cookie("session", samesite="none" if _is_prod else "lax")
    return {"ok": True}


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return user
