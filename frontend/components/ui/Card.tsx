"use client";

import React from "react";
import type { CSSProperties, ReactNode } from "react";

/**
 * Capitalis design-system card primitives.
 * Use these everywhere — no more ad-hoc inline backgrounds.
 *
 * Variants:
 *   "default" — bg-card + card-border. Standard surface (scorer/screener default).
 *   "inner"   — bg-inner. Nested cards inside a default card.
 *   "dark"    — strong contrast (bg-surface dark). For sidebars, dark panels.
 *   "ghost"   — transparent + dashed border. Empty / placeholder state.
 *
 * Padding tokens: "sm" (12/14), "md" (14/18), "lg" (18/22), "xl" (22/26).
 *
 * All header text uses Manrope. All numbers should use tabular-nums.
 */

export type CardVariant = "default" | "inner" | "dark" | "ghost";
export type CardPad = "none" | "sm" | "md" | "lg" | "xl";

const VARIANT_BG: Record<CardVariant, string> = {
  default: "var(--bg-card)",
  inner:   "var(--bg-inner)",
  dark:    "#0F172A",
  ghost:   "transparent",
};
const VARIANT_COLOR: Record<CardVariant, string | undefined> = {
  default: undefined,
  inner:   undefined,
  dark:    "#F1F5F9",
  ghost:   undefined,
};
const VARIANT_BORDER: Record<CardVariant, string> = {
  default: "1px solid var(--card-border)",
  inner:   "1px solid var(--card-border)",
  dark:    "1px solid var(--card-border)",
  ghost:   "1px dashed var(--card-border)",
};
const PAD: Record<CardPad, string> = {
  none: "0",
  sm:   "12px 14px",
  md:   "14px 18px",
  lg:   "18px 22px",
  xl:   "22px 26px",
};

interface CardProps {
  children: ReactNode;
  variant?: CardVariant;
  pad?: CardPad;
  hoverable?: boolean;
  style?: CSSProperties;
  onClick?: () => void;
  className?: string;
}

export function Card({
  children, variant = "default", pad = "lg",
  hoverable = false, style, onClick, className,
}: CardProps) {
  return (
    <div
      onClick={onClick}
      className={className}
      style={{
        background:   VARIANT_BG[variant],
        border:       VARIANT_BORDER[variant],
        borderRadius: "var(--r-xl)",
        padding:      PAD[pad],
        color:        VARIANT_COLOR[variant],
        cursor:       onClick ? "pointer" : undefined,
        transition:   hoverable ? "border-color 0.15s, background 0.12s" : undefined,
        ...(variant === "dark" ? {
          "--t1": "#F1F5F9",
          "--t2": "#CBD5E1",
          "--t3": "rgba(241,245,249,0.45)",
          "--card-border": "rgba(255,255,255,0.06)",
        } as React.CSSProperties : {}),
        ...style,
      }}
      onMouseEnter={hoverable ? e => (e.currentTarget.style.borderColor = "var(--orange-border)") : undefined}
      onMouseLeave={hoverable ? e => (e.currentTarget.style.borderColor = "var(--card-border)") : undefined}
    >
      {children}
    </div>
  );
}

/**
 * CardHeader — consistent header block: title, optional subtitle, optional action(s).
 * Use inside Card with pad="none", or use CardSection for full structure.
 */
interface CardHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  bordered?: boolean;
  size?: "sm" | "md";
}

export function CardHeader({
  title, subtitle, icon, action, bordered = true, size = "md",
}: CardHeaderProps) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 12, padding: size === "sm" ? "10px 16px" : "14px 20px",
      borderBottom: bordered ? "1px solid var(--card-border)" : "none",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {icon && <span style={{ display: "flex", color: "var(--orange)", flexShrink: 0 }}>{icon}</span>}
        <div style={{ minWidth: 0 }}>
          <h3 style={{
            fontFamily:   "Manrope, DM Sans, sans-serif",
            fontSize:     size === "sm" ? "0.82rem" : "0.92rem",
            fontWeight:   700,
            color:        "var(--t1)",
            margin:       0,
            letterSpacing: "-0.005em",
            overflow:     "hidden",
            textOverflow: "ellipsis",
            whiteSpace:   "nowrap",
          }}>
            {title}
          </h3>
          {subtitle && (
            <p style={{
              fontSize: "0.68rem", color: "var(--t3)", marginTop: 2,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}

/**
 * SectionLabel — small uppercase label used for sub-headers / column headers.
 */
export function SectionLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <p style={{
      fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.09em",
      textTransform: "uppercase", color: "var(--t3)", margin: 0, ...style,
    }}>
      {children}
    </p>
  );
}

/**
 * KpiCard — single metric tile. Used for top KPI strips.
 * Non-identical structure encouraged: pass children to vary content per card.
 */
interface KpiCardProps {
  label:    string;
  value:    ReactNode;
  delta?:   { value: number; label?: string } | null;
  hint?:    ReactNode;
  icon?:    ReactNode;
  accent?:  "orange" | "green" | "red" | "neutral";
  variant?: CardVariant;
  children?: ReactNode;
}

export function KpiCard({
  label, value, delta, hint, icon, accent = "neutral", variant = "default", children,
}: KpiCardProps) {
  const valueColor =
    accent === "orange" ? "var(--orange)" :
    accent === "green"  ? "var(--green)"  :
    accent === "red"    ? "var(--red)"    : "var(--t1)";
  return (
    <Card variant={variant} pad="lg" style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <SectionLabel>{label}</SectionLabel>
        {icon && <span style={{ color: "var(--t3)" }}>{icon}</span>}
      </div>
      <p style={{
        fontFamily: "Manrope, DM Sans, sans-serif",
        fontSize: "1.65rem", fontWeight: 700, color: valueColor,
        letterSpacing: "-0.018em", lineHeight: 1.05, margin: 0,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </p>
      {delta && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.7rem" }}>
          <span style={{
            color: delta.value >= 0 ? "var(--green)" : "var(--red)",
            fontWeight: 700, fontVariantNumeric: "tabular-nums",
          }}>
            {delta.value >= 0 ? "▲" : "▼"} {Math.abs(delta.value).toFixed(2)}%
          </span>
          {delta.label && <span style={{ color: "var(--t3)" }}>{delta.label}</span>}
        </div>
      )}
      {hint && !delta && (
        <p style={{ fontSize: "0.68rem", color: "var(--t3)", margin: 0 }}>{hint}</p>
      )}
      {children}
    </Card>
  );
}
