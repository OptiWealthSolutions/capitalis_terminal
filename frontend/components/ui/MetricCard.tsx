import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number | null | undefined;
  subValue?: string;
  accentColor?: "blue" | "orange" | "green" | "red";
  className?: string;
  icon?: ReactNode;
  delta?: { value: number; label?: string };
}

export default function MetricCard({
  label, value, subValue, accentColor, className, icon, delta,
}: MetricCardProps) {
  /* Empty state: em dash at 30% opacity per redesign.md */
  const display = value === null || value === undefined || value === "" ? null : String(value);
  const hasSub  = delta !== undefined || !!subValue;

  /* Delta color is the ONLY place semantic color is used */
  const deltaColor = (v: number) => v >= 0 ? "var(--green)" : "var(--red)";

  return (
    <div className={cn("metric-card", className)}>
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="mc-label">{label}</div>
        {icon && (
          <div style={{
            width: 26, height: 26, flexShrink: 0,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-sm)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--t2)",
          }}>
            {icon}
          </div>
        )}
      </div>

      {/* Value */}
      {display !== null ? (
        <div className="mc-value">{display}</div>
      ) : (
        <div className="mc-value" style={{ color: "var(--t3)", fontWeight: 400 }}>—</div>
      )}

      {/* Sub row */}
      {hasSub && (
        <div className="mc-sub">
          {delta !== undefined ? (
            <>
              <span style={{
                color: deltaColor(delta.value),
                
                fontSize: "0.72rem",
                fontWeight: 500,
              }}>
                {delta.value >= 0 ? "▲" : "▼"} {Math.abs(delta.value).toFixed(2)}%
              </span>
              {delta.label && (
                <span style={{ color: "var(--t3)", fontSize: "0.67rem" }}>{delta.label}</span>
              )}
            </>
          ) : (
            <span>{subValue}</span>
          )}
        </div>
      )}
    </div>
  );
}
