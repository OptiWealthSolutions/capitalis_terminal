"""
Thread-safe in-memory cache with TTL support.
Drop-in replacement for Redis in local/dev mode.
Production: swap CacheBackend implementation for redis.asyncio.
"""

import time
import threading
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

MACRO_TTL = 3600
MARKET_DATA_TTL = 3600
GARCH_TTL = 3600
INDICATORS_TTL = 86400
NEWS_TTL = 1800
SCREENER_TTL = 300
EQUITY_TTL = 3600


class _CacheEntry:
    __slots__ = ("value", "expires_at")

    def __init__(self, value: Any, ttl: int) -> None:
        self.value = value
        self.expires_at = time.monotonic() + ttl


class MemoryCache:
    """
    Thread-safe TTL cache backed by a dict.
    Keys are strings. Values must be JSON-serialisable (enforced at router level).
    Max 512 entries — evicts expired keys on set; if still full, evicts oldest.
    """

    MAX_SIZE = 512

    def __init__(self) -> None:
        self._store: dict[str, _CacheEntry] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            if time.monotonic() > entry.expires_at:
                del self._store[key]
                return None
            return entry.value

    def set(self, key: str, value: Any, ttl: int = 300) -> None:
        with self._lock:
            self._evict_expired()
            if len(self._store) >= self.MAX_SIZE:
                oldest_key = min(self._store, key=lambda k: self._store[k].expires_at)
                del self._store[oldest_key]
                logger.warning("Cache full — evicted oldest entry: %s", oldest_key)
            self._store[key] = _CacheEntry(value, ttl)

    def delete(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    def _evict_expired(self) -> None:
        now = time.monotonic()
        expired = [k for k, v in self._store.items() if now > v.expires_at]
        for k in expired:
            del self._store[k]


cache = MemoryCache()
