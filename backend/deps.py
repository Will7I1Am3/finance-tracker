import os

from authlib.integrations.starlette_client import OAuth
from fastapi import HTTPException, Request, Response
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

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
        return data
    except (BadSignature, SignatureExpired):
        raise HTTPException(status_code=401, detail="Not authenticated")
