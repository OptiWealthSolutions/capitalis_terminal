import { cn } from "@/lib/utils";

interface Props {
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_MAP = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-10 w-10 border-[3px]",
};

export function LoadingSpinner({ label, size = "md", className }: Props) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)}>
      <div
        className={cn(
          "rounded-full border-bg-border border-t-accent-blue animate-spin",
          SIZE_MAP[size]
        )}
      />
      {label && (
        <span className="text-text-secondary text-xs uppercase tracking-wider">{label}</span>
      )}
    </div>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

export function SkeletonChart({ height = 300 }: { height?: number }) {
  return (
    <div
      className="skeleton rounded"
      style={{ height: `${height}px`, width: "100%" }}
    />
  );
}
