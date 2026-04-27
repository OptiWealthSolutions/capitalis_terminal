"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface WatchlistCtx {
  watchlist: string[];
  isWatched: (ticker: string) => boolean;
  toggleWatchlist: (ticker: string) => void;
}

const WatchlistContext = createContext<WatchlistCtx | null>(null);
const STORAGE_KEY = "capitalis_watchlist_v2";

const DEFAULT_TICKERS = [
  "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN",
  "META", "TSLA", "V", "JPM", "SPY",
];

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [watchlist, setWatchlist] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        // First visit (or key bumped) — seed and persist defaults
        localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_TICKERS));
        setWatchlist(DEFAULT_TICKERS);
      } else {
        const stored = JSON.parse(raw);
        if (Array.isArray(stored) && stored.length > 0) setWatchlist(stored);
        else {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_TICKERS));
          setWatchlist(DEFAULT_TICKERS);
        }
      }
    } catch {
      setWatchlist(DEFAULT_TICKERS);
    }
  }, []);

  function save(list: string[]) {
    setWatchlist(list);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function isWatched(ticker: string) { return watchlist.includes(ticker); }

  function toggleWatchlist(ticker: string) {
    if (isWatched(ticker)) save(watchlist.filter(t => t !== ticker));
    else save([...watchlist, ticker]);
  }

  return (
    <WatchlistContext.Provider value={{ watchlist, isWatched, toggleWatchlist }}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist(): WatchlistCtx {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error("useWatchlist must be used inside WatchlistProvider");
  return ctx;
}
