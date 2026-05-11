import numpy as np
import pandas as pd
import yfinance as yf
from pathlib import Path
import sys
import time
import concurrent.futures

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from src.core import config as settings

CACHE_DIR = settings.DATA_DIR / "cache"
CACHE_DIR.mkdir(exist_ok=True)

_YFINANCE_TIMEOUT_SECONDS = 45


def _download_with_timeout(tickers, period, interval, timeout_sec=_YFINANCE_TIMEOUT_SECONDS):
    """Wrapper yfinance avec timeout cross-platform via ThreadPoolExecutor."""
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(
            yf.download,
            tickers=tickers, period=period, interval=interval,
            progress=False, auto_adjust=True
        )
        try:
            return future.result(timeout=timeout_sec)
        except concurrent.futures.TimeoutError:
            print(f"TIMEOUT API YFINANCE après {timeout_sec}s pour {tickers}")
            return pd.DataFrame()


def get_historical_returns(tickers, period="10y", interval="1d"):
    """
    Retourne les log-rendements quotidiens (ln(P_t / P_{t-1})) pour la liste de tickers.

    Utilise les log-returns (et non les rendements discrets pct_change) afin d'être
    cohérent avec les hypothèses log-normales du moteur Monte Carlo et des modèles GARCH.
    """
    # Sanitize tickers for filesystem use — replace / and . that break paths
    def _safe(t: str) -> str:
        return t.replace("/", "-").replace("\\", "-").replace(":", "-")

    sorted_tickers = sorted(_safe(t) for t in tickers)
    ticker_str = "_".join(sorted_tickers)
    # macOS/ext4 filename limit ~255 chars. Hash when too long.
    if len(ticker_str) > 180:
        import hashlib
        digest = hashlib.sha1(ticker_str.encode()).hexdigest()[:12]
        ticker_str = f"{sorted_tickers[0]}_n{len(sorted_tickers)}_{digest}"
    cache_filename = f"logreturns_{ticker_str}_{period}_{interval}.csv"
    cache_path = CACHE_DIR / cache_filename

    if cache_path.exists():
        file_mod_time = cache_path.stat().st_mtime
        if (time.time() - file_mod_time) / 3600 < 24:
            print(f"Lecture des log-rendements depuis le cache : {cache_path}")
            try:
                returns = pd.read_csv(cache_path, index_col='Date', parse_dates=True)
                if all(ticker in returns.columns for ticker in tickers):
                    return returns
                else:
                    print("Le cache est incomplet, téléchargement nécessaire.")
            except Exception as e:
                print(f"Erreur de lecture du cache ({e}), téléchargement nécessaire.")

    data = _download_with_timeout(tickers=tickers, period=period, interval=interval)

    if data is None or data.empty:
        print("Avertissement : Aucune donnée retournée par yfinance.")
        return pd.DataFrame()

    prices = data['Close']

    # Limite la propagation des prix manquants à 5 jours ouvrés consécutifs
    # Au-delà, les NaN sont conservés (signal de données insuffisantes, pas de prix périmé)
    prices = prices.ffill(limit=5)

    # Log-returns : cohérents avec l'hypothèse log-normale de run_monte_carlo_portfolio
    # et avec le moteur GARCH (volatility_engine.py)
    returns = np.log(prices / prices.shift(1)).dropna()

    returns.to_csv(cache_path)

    return returns
