"use client";

import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import type { MarketData } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

const TICKERS = [
  { label: "S&P 500",    key: "SP500" },
  { label: "VIX",        key: "VIX" },
  { label: "US 10Y",     key: "US10Y",        suffix: "%" },
  { label: "YLD SPREAD", key: "YIELD_SPREAD", suffix: "%" },
  { label: "GOLD",       key: "GOLD",         prefix: "$" },
  { label: "OIL",        key: "OIL",          prefix: "$" },
];

export default function TopBar() {
  const { data } = useQuery<MarketData>({
    queryKey: ["market-data-topbar"],
    queryFn: () => get<MarketData>("/macro/market-data"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const getLast = (key: string) => {
    const arr = data?.data[key];
    return arr ? arr[arr.length - 1] ?? null : null;
  };
  const getPrev = (key: string) => {
    const arr = data?.data[key];
    return arr && arr.length >= 2 ? arr[arr.length - 2] ?? null : null;
  };

  return (
    <div className="ticker-tape sticky top-0 z-30">
      {TICKERS.map((t, i) => {
        const cur  = getLast(t.key);
        const prev = getPrev(t.key);
        const chg  = cur !== null && prev !== null ? cur - prev : null;
        const up   = chg !== null && chg >= 0;

        return (
          <span key={t.key} className="flex items-center">
            {i > 0 && (
              <span
                className="flex-shrink-0 mx-5"
                style={{ width: 1, height: 10, background: "rgba(255,255,255,0.10)" }}
              />
            )}
            <span className="flex items-center gap-2 whitespace-nowrap select-none">
              <span style={{ color: "var(--t3)", fontSize: 10.5, letterSpacing: "0.07em" }}>
                {t.label}
              </span>
              <span style={{ color: "var(--t1)", fontSize: 11, fontWeight: 500 }}>
                {cur !== null
                  ? `${t.prefix ?? ""}${formatNumber(cur, 2)}${t.suffix ?? ""}`
                  : "--"}
              </span>
              {chg !== null && (
                <span
                  style={{
                    color: up ? "var(--green)" : "var(--red)",
                    fontSize: 10.5,
                    fontWeight: 500,
                  }}
                >
                  {up ? "▲" : "▼"}{formatNumber(Math.abs(chg), 3)}
                </span>
              )}
            </span>
          </span>
        );
      })}

      <div
        className="ml-auto pl-5 flex items-center gap-2 flex-shrink-0"
        style={{ borderLeft: "1px solid rgba(255,255,255,0.08)" }}
      >
        <span className="live-dot" />
        <span style={{ fontSize: 10.5, color: "var(--t3)", letterSpacing: "0.10em" }}>LIVE</span>
      </div>
    </div>
  );
}
