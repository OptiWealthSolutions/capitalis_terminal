"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import ShareAllocationModal from "@/components/ShareAllocationModal";

type Variant = "icon" | "compact" | "prominent";

interface Props {
  label: string;
  tickers: string[];
  weights: number[];
  method?: string | null;
  variant?: Variant;
  text?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export default function ShareButton({
  label, tickers, weights, method,
  variant = "compact",
  text = "Partager",
  disabled,
  className,
  ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const canShare = !disabled && tickers.length > 0 && weights.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!canShare}
        aria-label={ariaLabel ?? `Partager ${label}`}
        className={className ?? buttonClass(variant)}
        style={buttonStyle(variant, !canShare)}
      >
        <Share2 size={iconSize(variant)} />
        {variant !== "icon" && <span>{text}</span>}
      </button>
      {canShare && (
        <ShareAllocationModal
          open={open}
          onClose={() => setOpen(false)}
          label={label}
          tickers={tickers}
          weights={weights}
          method={method}
        />
      )}
    </>
  );
}

function iconSize(v: Variant): number {
  if (v === "icon") return 14;
  if (v === "compact") return 13;
  return 16;
}

function buttonClass(v: Variant): string {
  if (v === "prominent") {
    return "btn-primary inline-flex items-center gap-2";
  }
  if (v === "compact") {
    return "inline-flex items-center gap-1.5 rounded-md text-xs font-medium transition-colors";
  }
  return "inline-flex items-center justify-center rounded-md transition-colors";
}

function buttonStyle(v: Variant, disabled: boolean): React.CSSProperties {
  if (v === "prominent") {
    return { padding: "10px 18px", fontSize: 13, opacity: disabled ? 0.4 : 1 };
  }
  if (v === "compact") {
    return {
      padding: "6px 10px",
      color: "var(--orange)",
      background: "var(--orange-dim)",
      border: "1px solid var(--orange-border)",
      opacity: disabled ? 0.4 : 1,
      cursor: disabled ? "not-allowed" : "pointer",
    };
  }
  return {
    width: 28, height: 28,
    color: "var(--orange)",
    background: "var(--orange-dim)",
    border: "1px solid var(--orange-border)",
    opacity: disabled ? 0.4 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}
