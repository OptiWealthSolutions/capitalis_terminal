import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number | null | undefined;
  subValue?: string;
  accentColor?: "blue" | "orange" | "green" | "red";
  className?: string;
}

const ACCENT_MAP: Record<string, string> = {
  blue: "border-l-accent-blue",
  orange: "border-l-accent-orange",
  green: "border-l-accent-green",
  red: "border-l-accent-red",
};

export default function MetricCard({
  label,
  value,
  subValue,
  accentColor = "blue",
  className,
}: MetricCardProps) {
  const displayValue = value === null || value === undefined ? "N/A" : String(value);

  return (
    <div
      className={cn(
        "metric-card border-l-4",
        ACCENT_MAP[accentColor],
        className
      )}
    >
      <div className="text-text-secondary text-xs uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className="text-text-primary text-xl font-semibold">{displayValue}</div>
      {subValue && (
        <div className="text-text-muted text-xs mt-1">{subValue}</div>
      )}
    </div>
  );
}
