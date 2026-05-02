"use client";

import dynamic from "next/dynamic";
import { SkeletonChart } from "@/components/ui/LoadingSpinner";
import type { Layout, Data, Config } from "plotly.js";
import { useTheme } from "@/lib/theme";

const Plot = dynamic(() => import("react-plotly.js"), {
  ssr: false,
  loading: () => <SkeletonChart height={350} />,
});

interface PlotlyChartProps {
  data: Partial<Data>[];
  layout?: Partial<Layout>;
  height?: number;
  className?: string;
  card?: boolean;
}

const BASE_CONFIG: Partial<Config> = {
  displayModeBar: false,
  displaylogo: false,
  responsive: true,
};

export default function PlotlyChart({
  data, layout = {}, height = 350, className, card = true,
}: PlotlyChartProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const fontColor    = isDark ? "rgba(245,245,245,0.32)" : "rgba(17,17,17,0.60)";
  const gridColor    = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.07)";
  const zeroColor    = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.12)";
  const hoverBg      = isDark ? "#101013" : "#FFFFFF";
  const hoverBorder  = isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.10)";
  const hoverFont    = isDark ? "#FFFFFF" : "#111111";
  const tmpl         = (isDark ? "plotly_dark" : "plotly_white") as unknown as Layout["template"];

  const baseLayout: Partial<Layout> = {
    template:      tmpl,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor:  "rgba(0,0,0,0)",
    font: { family: "monospace", color: fontColor, size: 10 },
    margin: { l: 52, r: 16, t: 24, b: 40 },
    legend: {
      orientation: "h",
      yanchor: "bottom", y: 1.02,
      xanchor: "right",  x: 1,
      bgcolor: "rgba(0,0,0,0)",
      bordercolor: "rgba(0,0,0,0)",
      font: { size: 10, color: fontColor },
    },
    xaxis: {
      gridcolor:     gridColor,
      gridwidth:     1,
      griddash:      "dot" as "dot",
      linecolor:     "rgba(0,0,0,0)",
      zerolinecolor: zeroColor,
      zerolinewidth: 1,
      tickfont:      { size: 10, color: fontColor },
      showgrid:      true,
    },
    yaxis: {
      gridcolor:     gridColor,
      gridwidth:     1,
      griddash:      "dot" as "dot",
      linecolor:     "rgba(0,0,0,0)",
      zerolinecolor: zeroColor,
      zerolinewidth: 1,
      tickfont:      { size: 10, color: fontColor },
      showgrid:      true,
    },
    hovermode: "x unified",
    hoverlabel: {
      bgcolor:     hoverBg,
      bordercolor: hoverBorder,
      font: { family: "monospace", size: 11, color: hoverFont },
    },
  };

  const mergedLayout: Partial<Layout> = {
    ...baseLayout,
    ...layout,
    height,
    xaxis: { ...baseLayout.xaxis, ...(layout.xaxis ?? {}) },
    yaxis: { ...baseLayout.yaxis, ...(layout.yaxis ?? {}) },
    font:  { ...baseLayout.font,  ...(layout.font  ?? {}) },
    legend: { ...baseLayout.legend, ...(layout.legend ?? {}) },
    hoverlabel: { ...baseLayout.hoverlabel, ...(layout.hoverlabel ?? {}) },
  };

  const inner = (
    <Plot
      key={isDark ? "dark" : "light"}
      data={data}
      layout={mergedLayout}
      config={BASE_CONFIG}
      style={{ width: "100%", height: `${height}px` }}
      useResizeHandler
      onInitialized={() => {
        // Container may still be settling layout on first render.
        // Force Plotly to re-measure after browser paints.
        setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
      }}
    />
  );

  if (!card) {
    return <div className={className} style={{ width: "100%" }}>{inner}</div>;
  }

  return (
    <div
      className={className}
      style={{
        background:      "var(--bg-card)",
        border:          "1px solid var(--border)",
        borderTopColor:  "var(--border-hi)",
        borderRadius:    "var(--r-2xl, 24px)",
        padding:         "16px 8px 8px",
        overflow:        "hidden",
        boxShadow:       "var(--card-shadow)",
        transition:      "background 0.15s, border-color 0.15s",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background     = "var(--bg-hover)";
        e.currentTarget.style.borderTopColor = "rgba(255,255,255,0.12)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background     = "var(--bg-card)";
        e.currentTarget.style.borderTopColor = "var(--border-hi)";
      }}
    >
      {inner}
    </div>
  );
}
