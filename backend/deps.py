import os

from authlib.integrations.starlette_client import OAuth
from fastapi import Depends, HTTPException, Request, Response
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from database import get_connection

_ADMIN_EMAILS = {e.strip() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()}

SESSION_MAX_AGE = 30 * 60  # 30 minutes of inactivity

oauth = OAuth()
oauth.register(
    name="google",
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_id=os.environ.get("GOOGLE_CLIENT_ID", ""),
    client_secret=os.environ.get("GOOGLE_CLIENT_SECRET", ""),
    client_kwargs={"scope": "openid email profile"},
)


def get_current_user(request: Request, response: Response) -> dict:
    token = request.cookies.get("session")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    secret = os.environ.get("COOKIE_SECRET", "")
    try:
        data = URLSafeTimedSerializer(secret).loads(token, max_age=SESSION_MAX_AGE)
        # Re-sign and refresh the cookie to extend the inactivity window
        new_token = URLSafeTimedSerializer(secret).dumps(data)
        _is_prod = os.environ.get("ENVIRONMENT", "development") == "production"
        response.set_cookie(
            "session", new_token,
            httponly=True,
            samesite="none" if _is_prod else "lax",
            secure=_is_prod,
            max_age=SESSION_MAX_AGE,
        )
        conn = get_connection()
        exists = conn.execute(
            "SELECT 1 FROM users WHERE id = %s", (data["user_id"],)
        ).fetchone()
        conn.close()
        if not exists:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return data
    except (BadSignature, SignatureExpired):
        raise HTTPException(status_code=401, detail="Not authenticated")


def get_admin_user(user: dict = Depends(get_current_user)) -> dict:
    if user.get("email") not in _ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
