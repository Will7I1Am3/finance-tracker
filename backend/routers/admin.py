from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, Query

from database import get_connection
from deps import get_admin_user


def _resolve_tz(tz_str: str) -> str:
    try:
        ZoneInfo(tz_str)
        return tz_str
    except (ZoneInfoNotFoundError, Exception):
        return "UTC"


def _today_utc():
    return datetime.now(timezone.utc).date()


def _range_start(range_str: str, _tz_str: str = "UTC"):
    today = _today_utc()
    if range_str == "7d":
        return today - timedelta(days=7)
    if range_str == "30d":
        return today - timedelta(days=30)
    return None

router = APIRouter(prefix="/admin", tags=["admin"])

_HAIKU_INPUT_COST_PER_M = 0.80
_HAIKU_OUTPUT_COST_PER_M = 0.40
_FLAT_COST_PER_UPLOAD = 0.04


def _estimate_cost(input_tokens: int, output_tokens: int, upload_count: int) -> float:
    if input_tokens or output_tokens:
        return round(
            (input_tokens / 1_000_000) * _HAIKU_INPUT_COST_PER_M
            + (output_tokens / 1_000_000) * _HAIKU_OUTPUT_COST_PER_M,
            4,
        )
    return round(upload_count * _FLAT_COST_PER_UPLOAD, 4)


@router.get("/stats")
def get_stats(tz: str = Query(default="UTC"), _admin: dict = Depends(get_admin_user)) -> dict:
    week_start = _today_utc() - timedelta(days=7)
    conn = get_connection()

    total_users = conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]
    total_statements = conn.execute("SELECT COUNT(*) AS n FROM statements").fetchone()["n"]
    total_llm_calls = conn.execute("SELECT COALESCE(SUM(upload_count), 0) AS n FROM usage").fetchone()["n"]
    active_this_week = conn.execute(
        "SELECT COUNT(DISTINCT user_id) AS n FROM usage WHERE date >= %s",
        (week_start,),
    ).fetchone()["n"]

    conn.close()
    save_rate = round(total_statements / total_llm_calls * 100, 1) if total_llm_calls else None
    return {
        "total_users": total_users,
        "total_statements": total_statements,
        "total_llm_calls": total_llm_calls,
        "active_this_week": active_this_week,
        "save_rate": save_rate,
    }


@router.get("/users")
def list_users(
    search: str = "",
    tz: str = Query(default="UTC"),
    _admin: dict = Depends(get_admin_user),
) -> list[dict]:
    today_utc = _today_utc()
    conn = get_connection()

    query = """
        SELECT
            u.id,
            u.email,
            u.created_at,
            COALESCE(SUM(CASE WHEN ug.date = %(today_utc)s THEN ug.upload_count ELSE 0 END), 0) AS uploads_today,
            COALESCE(SUM(ug.upload_count), 0)                                                    AS uploads_total,
            COALESCE(SUM(ug.input_tokens), 0)                                                    AS input_tokens,
            COALESCE(SUM(ug.output_tokens), 0)                                                   AS output_tokens,
            (SELECT COUNT(*) FROM statements s WHERE s.user_id = u.id)                           AS statement_count,
            MAX(ug.date)                                                                          AS last_active
        FROM users u
        LEFT JOIN usage ug ON ug.user_id = u.id
    """
    if search:
        query += " WHERE u.email ILIKE %(search)s"
    query += " GROUP BY u.id, u.email, u.created_at ORDER BY last_active DESC NULLS LAST"

    rows = conn.execute(query, {"today_utc": today_utc, "search": f"%{search}%"}).fetchall()
    conn.close()

    return [
        {
            **{k: v for k, v in dict(r).items() if k not in ("input_tokens", "output_tokens")},
            "estimated_cost": _estimate_cost(r["input_tokens"], r["output_tokens"], r["uploads_total"]),
        }
        for r in rows
    ]


@router.get("/activity")
def site_activity(
    range: str = "7d",
    tz: str = Query(default="UTC"),
    _admin: dict = Depends(get_admin_user),
) -> list[dict]:
    tz = _resolve_tz(tz)
    start = _range_start(range, tz)
    conn = get_connection()

    if start:
        rows = conn.execute(
            "SELECT date AS local_date, SUM(upload_count) AS uploads"
            " FROM usage WHERE date >= %s"
            " GROUP BY date ORDER BY date",
            (start,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT date AS local_date, SUM(upload_count) AS uploads"
            " FROM usage GROUP BY date ORDER BY date",
        ).fetchall()

    conn.close()
    return [{"date": str(r["local_date"]), "uploads": r["uploads"]} for r in rows]


@router.get("/signups")
def user_signups(
    range: str = "7d",
    tz: str = Query(default="UTC"),
    _admin: dict = Depends(get_admin_user),
) -> list[dict]:
    tz = _resolve_tz(tz)
    start = _range_start(range, tz)
    conn = get_connection()

    # created_at is TIMESTAMP WITHOUT TIME ZONE stored as UTC; treat as UTC then convert.
    local_date_expr = "DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE %(tz)s)"

    if start:
        rows = conn.execute(
            f"SELECT {local_date_expr} AS day, COUNT(*) AS new_users"
            f" FROM users WHERE created_at IS NOT NULL AND {local_date_expr} >= %(start)s"
            f" GROUP BY day ORDER BY day",
            {"tz": tz, "start": start},
        ).fetchall()
    else:
        rows = conn.execute(
            f"SELECT {local_date_expr} AS day, COUNT(*) AS new_users"
            f" FROM users WHERE created_at IS NOT NULL"
            f" GROUP BY day ORDER BY day",
            {"tz": tz},
        ).fetchall()

    conn.close()
    return [{"date": str(r["day"]), "new_users": r["new_users"]} for r in rows]


@router.get("/users/{user_id}/activity")
def user_activity(
    user_id: int,
    range: str = "7d",
    tz: str = Query(default="UTC"),
    _admin: dict = Depends(get_admin_user),
) -> list[dict]:
    tz = _resolve_tz(tz)
    conn = get_connection()

    if not conn.execute("SELECT 1 FROM users WHERE id = %s", (user_id,)).fetchone():
        conn.close()
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found")

    start = _range_start(range, tz)
    if start:
        rows = conn.execute(
            "SELECT date AS local_date, upload_count AS uploads"
            " FROM usage WHERE user_id = %s AND date >= %s"
            " ORDER BY date",
            (user_id, start),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT date AS local_date, upload_count AS uploads"
            " FROM usage WHERE user_id = %s ORDER BY date",
            (user_id,),
        ).fetchall()

    conn.close()
    return [{"date": str(r["local_date"]), "uploads": r["uploads"]} for r in rows]


@router.get("/costs")
def site_costs(
    range: str = "7d",
    tz: str = Query(default="UTC"),
    _admin: dict = Depends(get_admin_user),
) -> list[dict]:
    tz = _resolve_tz(tz)
    start = _range_start(range, tz)
    conn = get_connection()

    if start:
        rows = conn.execute(
            "SELECT date AS local_date,"
            " COALESCE(SUM(upload_count), 0) AS uploads,"
            " COALESCE(SUM(input_tokens), 0) AS input_tokens,"
            " COALESCE(SUM(output_tokens), 0) AS output_tokens"
            " FROM usage WHERE date >= %s"
            " GROUP BY date ORDER BY date",
            (start,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT date AS local_date,"
            " COALESCE(SUM(upload_count), 0) AS uploads,"
            " COALESCE(SUM(input_tokens), 0) AS input_tokens,"
            " COALESCE(SUM(output_tokens), 0) AS output_tokens"
            " FROM usage GROUP BY date ORDER BY date",
        ).fetchall()
    conn.close()

    result = []
    cumulative = 0.0
    for r in rows:
        daily = _estimate_cost(r["input_tokens"], r["output_tokens"], r["uploads"])
        cumulative = round(cumulative + daily, 6)
        result.append({
            "date": str(r["local_date"]),
            "cost_day": round(daily, 6),
            "cost_cumulative": round(cumulative, 6),
        })
    return result


@router.post("/users/{user_id}/reset-usage")
def reset_usage(user_id: int, _admin: dict = Depends(get_admin_user)) -> dict:
    conn = get_connection()

    if not conn.execute("SELECT 1 FROM users WHERE id = %s", (user_id,)).fetchone():
        conn.close()
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found")

    conn.execute(
        "UPDATE usage SET upload_count = 0 WHERE user_id = %s AND date = %s",
        (user_id, _today_utc()),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


@router.delete("/users/{user_id}")
def delete_user(user_id: int, _admin: dict = Depends(get_admin_user)) -> dict:
    conn = get_connection()

    if not conn.execute("SELECT 1 FROM users WHERE id = %s", (user_id,)).fetchone():
        conn.close()
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found")

    conn.execute(
        "DELETE FROM transactions WHERE statement_id IN (SELECT id FROM statements WHERE user_id = %s)",
        (user_id,),
    )
    conn.execute("DELETE FROM statements WHERE user_id = %s", (user_id,))
    conn.execute("DELETE FROM cards WHERE user_id = %s", (user_id,))
    conn.execute("DELETE FROM usage WHERE user_id = %s", (user_id,))
    conn.execute("DELETE FROM category_corrections WHERE user_id = %s", (user_id,))
    conn.execute("DELETE FROM users WHERE id = %s", (user_id,))
    conn.commit()
    conn.close()
    return {"ok": True}
