"use client";

import dynamic from "next/dynamic";
import { SkeletonChart } from "@/components/ui/LoadingSpinner";
import type { Layout, Data, Config } from "plotly.js";

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

const BASE_LAYOUT: Partial<Layout> = {
  template:      "plotly_dark" as unknown as Layout["template"],
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor:  "rgba(0,0,0,0)",
  font: { family: "JetBrains Mono, monospace", color: "rgba(255,255,255,0.28)", size: 10 },
  margin: { l: 52, r: 16, t: 24, b: 40 },
  legend: {
    orientation: "h",
    yanchor: "bottom", y: 1.02,
    xanchor: "right",  x: 1,
    bgcolor: "rgba(0,0,0,0)",
    bordercolor: "rgba(0,0,0,0)",
    font: { size: 10, color: "rgba(255,255,255,0.40)" },
  },
  xaxis: {
    gridcolor:    "rgba(255,255,255,0.04)",
    gridwidth:    1,
    griddash:     "dot" as "dot",
    linecolor:    "rgba(0,0,0,0)",
    zerolinecolor: "rgba(255,255,255,0.06)",
    zerolinewidth: 1,
    tickfont:     { size: 10, color: "rgba(255,255,255,0.28)" },
    showgrid:     true,
  },
  yaxis: {
    gridcolor:    "rgba(255,255,255,0.04)",
    gridwidth:    1,
    griddash:     "dot" as "dot",
    linecolor:    "rgba(0,0,0,0)",
    zerolinecolor: "rgba(255,255,255,0.06)",
    zerolinewidth: 1,
    tickfont:     { size: 10, color: "rgba(255,255,255,0.28)" },
    showgrid:     true,
  },
  hovermode: "x unified",
  hoverlabel: {
    bgcolor:     "#101013",
    bordercolor: "rgba(255,255,255,0.09)",
    font: { family: "JetBrains Mono, monospace", size: 11, color: "#FFFFFF" },
  },
};

const BASE_CONFIG: Partial<Config> = {
  displayModeBar: true,
  modeBarButtonsToRemove: ["toImage", "sendDataToCloud", "lasso2d", "select2d"],
  displaylogo: false,
  responsive:  true,
};

export default function PlotlyChart({
  data, layout = {}, height = 350, className, card = true,
}: PlotlyChartProps) {
  const mergedLayout: Partial<Layout> = {
    ...BASE_LAYOUT,
    ...layout,
    height,
    xaxis: { ...BASE_LAYOUT.xaxis, ...(layout.xaxis ?? {}) },
    yaxis: { ...BASE_LAYOUT.yaxis, ...(layout.yaxis ?? {}) },
    font:  { ...BASE_LAYOUT.font,  ...(layout.font  ?? {}) },
  };

  const inner = (
    <Plot
      data={data}
      layout={mergedLayout}
      config={BASE_CONFIG}
      style={{ width: "100%", height: `${height}px` }}
      useResizeHandler
    />
  );

  if (!card) {
    return <div className={className} style={{ width: "100%" }}>{inner}</div>;
  }

  return (
    <div
      className={className}
      style={{
        background: "var(--bg-card)",
        border:          "1px solid var(--border)",
        borderTopColor:  "var(--border-hi)",
        /* Major container = 24px per redesign.md */
        borderRadius:    "var(--r-2xl, 24px)",
        padding:         "16px 8px 8px",
        overflow:        "hidden",
        boxShadow:       "var(--card-shadow)",
        transition:      "background 0.15s, border-color 0.15s",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = "var(--bg-hover)";
        e.currentTarget.style.borderTopColor = "rgba(255,255,255,0.12)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = "var(--bg-card)";
        e.currentTarget.style.borderTopColor = "var(--border-hi)";
      }}
    >
      {inner}
    </div>
  );
}
