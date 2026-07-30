"""
Persistent SQLite cache for equity fundamental and financial data.
Fallback when yfinance is unavailable — serves last known good data.
Max staleness: 4 hours for fundamentals, 24 hours for financials.
"""

import json
import logging
import sqlite3
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_DB = Path(__file__).resolve().parent.parent / "data" / "equity_cache.db"
_FUND_TTL = 4 * 3600   # 4 h
_FIN_TTL  = 24 * 3600  # 24 h


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(str(_DB), check_same_thread=False)
    c.execute("""
        CREATE TABLE IF NOT EXISTS equity_data (
            ticker     TEXT NOT NULL,
            data_type  TEXT NOT NULL,
            data       TEXT NOT NULL,
            fetched_at INTEGER NOT NULL,
            PRIMARY KEY (ticker, data_type)
        )
    """)
    c.commit()
    return c


def read(ticker: str, data_type: str, ttl: int | None = None) -> Any | None:
    """Return cached value if fresh (within ttl seconds). None if missing or stale."""
    try:
        with _conn() as c:
            row = c.execute(
                "SELECT data, fetched_at FROM equity_data WHERE ticker=? AND data_type=?",
                (ticker.upper(), data_type)
            ).fetchone()
        if row is None:
            return None
        if ttl is not None and (time.time() - row[1]) > ttl:
            return None
        return json.loads(row[0])
    except Exception as e:
        logger.warning("equity_cache read error: %s", e)
        return None


def read_stale(ticker: str, data_type: str) -> Any | None:
    """Return cached value regardless of age — used as last-resort fallback."""
    try:
        with _conn() as c:
            row = c.execute(
                "SELECT data FROM equity_data WHERE ticker=? AND data_type=?",
                (ticker.upper(), data_type)
            ).fetchone()
        return json.loads(row[0]) if row else None
    except Exception as e:
        logger.warning("equity_cache stale read error: %s", e)
        return None


def write(ticker: str, data_type: str, data: Any) -> None:
    """Persist or update equity data in SQLite."""
    try:
        with _conn() as c:
            c.execute(
                "INSERT OR REPLACE INTO equity_data (ticker, data_type, data, fetched_at) VALUES (?,?,?,?)",
                (ticker.upper(), data_type, json.dumps(data), int(time.time()))
            )
    except Exception as e:
        logger.warning("equity_cache write error: %s", e)
