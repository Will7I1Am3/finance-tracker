import os

from fastapi import APIRouter
from fastapi.responses import JSONResponse, RedirectResponse
from itsdangerous import URLSafeTimedSerializer

from database import get_connection
from deps import SESSION_MAX_AGE

router = APIRouter(prefix="/dev", tags=["dev"])

_FRONTEND = os.environ.get("FRONTEND_URL", "http://localhost:5173")
_DEV_EMAIL = "dev@admin.local"
_DEV_GOOGLE_ID = "dev-bypass"


@router.get("/admin-login")
def dev_admin_login():
    if os.environ.get("ENVIRONMENT", "development") == "production":
        return JSONResponse(status_code=404, content={"detail": "Not found"})

    conn = get_connection()
    conn.execute(
        "INSERT INTO users (google_id, email) VALUES (%s, %s) ON CONFLICT (google_id) DO NOTHING",
        (_DEV_GOOGLE_ID, _DEV_EMAIL),
    )
    conn.commit()
    user = conn.execute(
        "SELECT id, email FROM users WHERE google_id = %s", (_DEV_GOOGLE_ID,)
    ).fetchone()
    conn.close()

    session_token = URLSafeTimedSerializer(os.environ.get("COOKIE_SECRET", "")).dumps(
        {"user_id": user["id"], "email": user["email"]}
    )
    response = RedirectResponse(url=_FRONTEND)
    response.set_cookie(
        "session", session_token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=SESSION_MAX_AGE,
    )
    return response
