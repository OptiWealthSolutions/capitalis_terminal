import logging
import time
import requests

logger = logging.getLogger(__name__)

# Simple in-process TTL cache (no streamlit dependency)
_cache: dict = {}
_CACHE_TTL = 3600


def fetch_macro_news(api_key: str, limit: int = 15) -> list:
    cache_key = f"macro_news:{limit}"
    entry = _cache.get(cache_key)
    if entry and time.time() - entry["ts"] < _CACHE_TTL:
        return entry["data"]

    url = (
        f"https://www.alphavantage.co/query"
        f"?function=NEWS_SENTIMENT&topics=economy_macro&sort=LATEST&apikey={api_key}"
    )
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()

        if "Information" in data:
            logger.warning("Alpha Vantage API limit: %s", data["Information"])
            return []

        result = data.get("feed", [])[:limit]
        _cache[cache_key] = {"ts": time.time(), "data": result}
        return result

    except requests.exceptions.RequestException as e:
        logger.error("Alpha Vantage connection error: %s", e)
        return []
