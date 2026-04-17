"use client";

import { useEffect, useRef } from "react";

interface TVChartProps {
  dates: string[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume?: number[];
  sma50?: (number | null)[];
  sma200?: (number | null)[];
  height?: number;
  ticker?: string;
}

export default function TVChart({
  dates,
  open,
  high,
  low,
  close,
  volume,
  sma50,
  sma200,
  height = 400,
  ticker = "",
}: TVChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || dates.length === 0) return;

    let cleanup: (() => void) | undefined;

    import("lightweight-charts").then((lc) => {
      const { createChart, ColorType, CrosshairMode, CandlestickSeries, LineSeries, HistogramSeries } = lc as any;

      if (!containerRef.current) return;

      const chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height,
        layout: {
          background: { type: ColorType.Solid, color: "#0D1117" },
          textColor: "#9CA3AF",
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: "#1F2937" },
          horzLines: { color: "#1F2937" },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: "#F97316", labelBackgroundColor: "#F97316" },
          horzLine: { color: "#374151", labelBackgroundColor: "#374151" },
        },
        rightPriceScale: {
          borderColor: "#374151",
          scaleMargins: { top: 0.1, bottom: volume ? 0.3 : 0.05 },
        },
        timeScale: {
          borderColor: "#374151",
          timeVisible: true,
          secondsVisible: false,
        },
        handleScroll: true,
        handleScale: true,
      });

      // Candlestick series
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#22C55E",
        downColor: "#EF4444",
        borderUpColor: "#22C55E",
        borderDownColor: "#EF4444",
        wickUpColor: "#22C55E",
        wickDownColor: "#EF4444",
        title: ticker,
      });

      const candleData = dates.map((d, i) => ({
        time: d,
        open: open[i],
        high: high[i],
        low: low[i],
        close: close[i],
      }));
      candleSeries.setData(candleData);

      // SMA 50
      if (sma50) {
        const sma50Series = chart.addSeries(LineSeries, {
          color: "#F97316",
          lineWidth: 1,
          lineStyle: 2,
          title: "SMA 50",
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        const sma50Data = dates
          .map((d, i) => (sma50[i] != null ? { time: d, value: sma50[i] } : null))
          .filter(Boolean);
        sma50Series.setData(sma50Data);
      }

      // SMA 200
      if (sma200) {
        const sma200Series = chart.addSeries(LineSeries, {
          color: "#3B82F6",
          lineWidth: 1,
          lineStyle: 2,
          title: "SMA 200",
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        const sma200Data = dates
          .map((d, i) => (sma200[i] != null ? { time: d, value: sma200[i] } : null))
          .filter(Boolean);
        sma200Series.setData(sma200Data);
      }

      // Volume histogram on a separate pane
      if (volume) {
        const volSeries = chart.addSeries(
          HistogramSeries,
          {
            color: "rgba(59,130,246,0.25)",
            priceFormat: { type: "volume" },
            priceLineVisible: false,
            lastValueVisible: false,
          },
          1,
        );
        const volData = dates.map((d, i) => ({
          time: d,
          value: volume[i],
          color: close[i] >= open[i] ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)",
        }));
        volSeries.setData(volData);
        chart.panes()[1]?.setHeight(80);
      }

      chart.timeScale().fitContent();

      const handleResize = () => {
        if (containerRef.current) {
          chart.applyOptions({ width: containerRef.current.clientWidth });
        }
      };
      const ro = new ResizeObserver(handleResize);
      ro.observe(containerRef.current);

      cleanup = () => {
        ro.disconnect();
        chart.remove();
      };
    });

    return () => cleanup?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates.length, ticker, height]);

  return (
    <div
      ref={containerRef}
      style={{ height, width: "100%" }}
      className="overflow-hidden"
    />
  );
}
