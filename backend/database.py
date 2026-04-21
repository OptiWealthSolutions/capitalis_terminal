"""
Unified DB adapter: SQLite (dev) or PostgreSQL (prod).
Activated by DATABASE_URL env var (postgresql:// or postgres://).
All modules import db_context() instead of sqlite3 directly.
"""
import os
import re
from contextlib import contextmanager
from pathlib import Path
from typing import Optional

_raw = os.environ.get("DATABASE_URL", "").strip()
# Railway provides postgres:// — normalize to postgresql://
DATABASE_URL: str = (
    "postgresql://" + _raw[len("postgres://"):]
    if _raw.startswith("postgres://") else _raw
)
USE_PG: bool = DATABASE_URL.startswith("postgresql://")

_SQLITE_NOW_RE = re.compile(r"datetime\('now'\)", re.IGNORECASE)
_PRAGMA_RE = re.compile(r"^\s*PRAGMA\b", re.IGNORECASE)


def _to_pg(sql: str) -> str:
    """Convert SQLite placeholders/functions to PostgreSQL dialect."""
    sql = sql.replace("?", "%s")
    sql = _SQLITE_NOW_RE.sub("NOW()", sql)
    return sql


# ---------------------------------------------------------------------------
# Row wrapper — supports both r["col"] and r[0] positional access
# ---------------------------------------------------------------------------

class _Row(dict):
    """dict subclass compatible with sqlite3.Row interface."""

    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)

    def __getattr__(self, name: str):
        try:
            return self[name]
        except KeyError:
            raise AttributeError(name)

    def keys(self):
        return super().keys()


class _CursorProxy:
    def __init__(self, cur, pg: bool):
        self._cur = cur
        self._pg = pg

    def fetchone(self):
        row = self._cur.fetchone()
        if row is None:
            return None
        return _Row(dict(row)) if self._pg else row

    def fetchall(self):
        rows = self._cur.fetchall()
        return [_Row(dict(r)) for r in rows] if self._pg else rows

    def __iter__(self):
        return iter(self.fetchall())


class _ConnProxy:
    def __init__(self, raw, pg: bool):
        self._raw = raw
        self._pg = pg

    def execute(self, sql: str, params=()) -> _CursorProxy:
        if self._pg:
            cur = self._raw.cursor()
            cur.execute(_to_pg(sql), params)
            return _CursorProxy(cur, True)
        return _CursorProxy(self._raw.execute(sql, params), False)

    def executemany(self, sql: str, seq) -> None:
        if self._pg:
            cur = self._raw.cursor()
            cur.executemany(_to_pg(sql), seq)
        else:
            self._raw.executemany(sql, seq)

    def executescript(self, script: str) -> None:
        """Execute multiple semicolon-separated statements (handles both dialects)."""
        if self._pg:
            for stmt in script.split(";"):
                stmt = stmt.strip()
                if stmt and not _PRAGMA_RE.match(stmt):
                    cur = self._raw.cursor()
                    cur.execute(_to_pg(stmt))
        else:
            self._raw.executescript(script)

    def commit(self) -> None:
        self._raw.commit()

    def rollback(self) -> None:
        self._raw.rollback()


# ---------------------------------------------------------------------------
# Context manager — same interface for both backends
# ---------------------------------------------------------------------------

if USE_PG:
    import psycopg2
    import psycopg2.extras
    import psycopg2.pool

    _pool: Optional["psycopg2.pool.SimpleConnectionPool"] = None

    def _get_pool() -> "psycopg2.pool.SimpleConnectionPool":
        global _pool
        if _pool is None:
            _pool = psycopg2.pool.SimpleConnectionPool(
                minconn=1,
                maxconn=10,
                dsn=DATABASE_URL,
                cursor_factory=psycopg2.extras.RealDictCursor,
            )
        return _pool

    @contextmanager
    def db_context(_sqlite_path: Optional[Path] = None):
        """Yield a PostgreSQL _ConnProxy from the connection pool."""
        pool = _get_pool()
        conn = pool.getconn()
        try:
            yield _ConnProxy(conn, pg=True)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            pool.putconn(conn)

else:
    import sqlite3

    @contextmanager
    def db_context(sqlite_path: Path):
        """Yield a SQLite _ConnProxy."""
        sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(sqlite_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        try:
            yield _ConnProxy(conn, pg=False)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
