"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { get } from "@/lib/api";

interface LogoResponse { ticker: string; domain: string | null; url: string | null }

function initials(ticker: string): string {
  return ticker.slice(0, 2).toUpperCase();
}

function hueFromTicker(ticker: string): number {
  let h = 0;
  for (let i = 0; i < ticker.length; i++) h = (h * 31 + ticker.charCodeAt(i)) | 0;
  return ((h % 360) + 360) % 360;
}

interface Props {
  ticker: string;
  size?: number;
  className?: string;
  rounded?: boolean;
}

export default function TickerLogo({ ticker, size = 24, className, rounded = true }: Props) {
  const tk = (ticker || "").toUpperCase().trim();
  const [sourceIdx, setSourceIdx] = useState(0);

  const { data } = useQuery<LogoResponse>({
    queryKey: ["logo", tk],
    queryFn: () => get(`/equity/${encodeURIComponent(tk)}/logo`),
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
    enabled: !!tk && !tk.startsWith("^"),
  });

  // Multi-source fallback chain. Pure tickers without domain still try FMP.
  const sources = useMemo(() => {
    const out: string[] = [];
    if (data?.url) out.push(data.url);                                              // clearbit (best quality, needs domain)
    out.push(`https://financialmodelingprep.com/image-stock/${tk}.png`);           // FMP free, no key, US-heavy
    if (data?.domain) out.push(`https://www.google.com/s2/favicons?sz=64&domain=${data.domain}`); // last resort favicon
    return out;
  }, [data?.url, data?.domain, tk]);

  const url = sources[sourceIdx];
  const showFallback = !tk || tk.startsWith("^") || sourceIdx >= sources.length;

  const base: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: rounded ? "50%" : 4,
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    background: showFallback
      ? `oklch(0.65 0.08 ${hueFromTicker(tk)})`
      : "#fff",
    border: "1px solid var(--card-border)",
  };

  if (showFallback) {
    return (
      <span className={className} style={base} aria-label={tk}>
        <span style={{
          fontSize: Math.max(8, Math.round(size * 0.42)),
          fontWeight: 700,
          color: "#fff",
          letterSpacing: "-0.02em",
          fontFamily: "Manrope, DM Sans, sans-serif",
        }}>
          {initials(tk)}
        </span>
      </span>
    );
  }

  return (
    <span className={className} style={base} aria-label={tk}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={tk}
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setSourceIdx(i => i + 1)}
        style={{ width: size, height: size, objectFit: "contain", background: "#fff" }}
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}
