"use client";

import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import type { MarketData } from "@/lib/types";
import { formatNumber, colorForValue } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface TickerItem {
  label: string;
  key: string;
  prefix?: string;
  suffix?: string;
}

const TICKER_ITEMS: TickerItem[] = [
  { label: "S&P 500", key: "SP500", prefix: "" },
  { label: "VIX", key: "VIX" },
  { label: "US 10Y", key: "US10Y", suffix: "%" },
  { label: "YIELD SPREAD", key: "YIELD_SPREAD", suffix: "%" },
  { label: "GOLD", key: "GOLD", prefix: "$" },
  { label: "OIL", key: "OIL", prefix: "$" },
];

export default function TopBar() {
  const { data } = useQuery<MarketData>({
    queryKey: ["market-data-topbar"],
    queryFn: () => get<MarketData>("/macro/market-data"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const getLastValue = (key: string): number | null => {
    if (!data?.data[key]) return null;
    const arr = data.data[key];
    return arr[arr.length - 1] ?? null;
  };

  const getPrevValue = (key: string): number | null => {
    if (!data?.data[key]) return null;
    const arr = data.data[key];
    return arr[arr.length - 2] ?? null;
  };

  return (
    <div className="ticker-tape text-text-secondary sticky top-0 z-30">
      {TICKER_ITEMS.map((item) => {
        const current = getLastValue(item.key);
        const prev = getPrevValue(item.key);
        const change = current !== null && prev !== null ? current - prev : null;
        const changeColor = change !== null ? colorForValue(change) : "text-text-secondary";

        return (
          <span key={item.key} className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-text-muted text-xs">{item.label}:</span>
            <span className="text-text-primary font-medium">
              {current !== null
                ? `${item.prefix ?? ""}${formatNumber(current, 2)}${item.suffix ?? ""}`
                : "--"}
            </span>
            {change !== null && (
              <span className={cn("text-xs", changeColor)}>
                {change > 0 ? "+" : ""}
                {formatNumber(change, 3)}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
