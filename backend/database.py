import os

import psycopg2
import psycopg2.extras

SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS users (
        id        SERIAL PRIMARY KEY,
        google_id TEXT NOT NULL UNIQUE,
        email     TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS cards (
        id      SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        name    TEXT NOT NULL,
        UNIQUE(user_id, name)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS statements (
        id                SERIAL PRIMARY KEY,
        user_id           INTEGER NOT NULL REFERENCES users(id),
        card_id           INTEGER NOT NULL REFERENCES cards(id),
        period_start      DATE NOT NULL,
        period_end        DATE NOT NULL,
        pdf_hash          TEXT NOT NULL,
        statement_balance TEXT,
        UNIQUE(user_id, pdf_hash)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS transactions (
        id           SERIAL PRIMARY KEY,
        statement_id INTEGER NOT NULL REFERENCES statements(id),
        card_id      INTEGER NOT NULL REFERENCES cards(id),
        date         DATE NOT NULL,
        description  TEXT NOT NULL,
        location     TEXT NOT NULL DEFAULT '',
        category     TEXT NOT NULL,
        amount       TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS category_corrections (
        user_id     INTEGER NOT NULL REFERENCES users(id),
        description TEXT NOT NULL,
        category    TEXT NOT NULL,
        PRIMARY KEY (user_id, description)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS usage (
        user_id      INTEGER NOT NULL REFERENCES users(id),
        date         DATE NOT NULL,
        upload_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, date)
    )
    """,
]


class _Cursor:
    """Thin wrapper so routers can call .fetchone() / .fetchall() directly on execute() results."""

    def __init__(self, cursor):
        self._cursor = cursor

    def fetchone(self):
        row = self._cursor.fetchone()
        return row  # already a RealDictRow (behaves like dict)

    def fetchall(self):
        return self._cursor.fetchall()  # list of RealDictRow


class DBConnection:
    def __init__(self, conn):
        self._conn = conn

    def execute(self, query: str, params=None) -> _Cursor:
        cur = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(query, params)
        return _Cursor(cur)

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()


def get_connection() -> DBConnection:
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    return DBConnection(conn)


def init_db() -> None:
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    for stmt in SCHEMA_STATEMENTS:
        cur.execute(stmt)
    conn.commit()
    cur.close()
    conn.close()
