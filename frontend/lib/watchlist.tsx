"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface WatchlistCtx {
  watchlist: string[];
  isWatched: (ticker: string) => boolean;
  toggleWatchlist: (ticker: string) => void;
}

const WatchlistContext = createContext<WatchlistCtx | null>(null);
const STORAGE_KEY = "capitalis_watchlist_v1";

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [watchlist, setWatchlist] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (Array.isArray(stored)) setWatchlist(stored);
    } catch {}
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
