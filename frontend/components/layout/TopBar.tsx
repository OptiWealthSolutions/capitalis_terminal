"use client";

import { useEffect, useState } from "react";
import { Sparkles, Briefcase, TrendingUp, Target, Sun, Moon, Menu, UserCircle, Sliders } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { useInvestorMode } from "@/lib/investorMode";

interface SavedPortfolio {
  name?: string;
  tickers?: string[];
  capital?: number;
  result?: { metrics?: { expected_annual_return?: number; sharpe_ratio?: number } } | null;
}

const STORAGE_KEY = "capitalis_portfolios_v2";

interface TopBarProps {
  onMenuToggle: () => void;
}

export default function TopBar({ onMenuToggle }: TopBarProps) {
  const { theme, toggle } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const { mode, toggleMode, openProfileModal } = useInvestorMode();
  const [pf, setPf] = useState<SavedPortfolio | null>(null);

  useEffect(() => {
    try {
      const list = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as SavedPortfolio[];
      setPf(list[0] ?? null);
    } catch {
      setPf(null);
    }
  }, []);

  const metrics = pf?.result?.metrics;

  return (
    <div className="ticker-tape sticky top-0 z-30">
      {/* Hamburger — mobile only */}
      <button
        className="hidden flex-shrink-0 mr-2 p-1 rounded"
        onClick={onMenuToggle}
        style={{ color: "var(--t3)" }}
      >
        <Menu size={15} />
      </button>

      <div className="hidden sm:flex items-center overflow-x-auto flex-1 min-w-0">
        {pf ? (
          <>
            <Divider />
            <Chip icon={<Briefcase size={11} />} label={t.topbar.last}>
              <span style={{ color: "var(--t1)", fontWeight: 500 }}>{pf.name ?? "—"}</span>
            </Chip>

            {metrics?.expected_annual_return !== undefined && (
              <>
                <Divider />
                <Chip icon={<TrendingUp size={11} />} label={t.topbar.expReturn}>
                  <span className="mono" style={{ color: "var(--green)", fontWeight: 500 }}>
                    {(metrics.expected_annual_return * 100).toFixed(1)}%
                  </span>
                </Chip>
              </>
            )}

            {metrics?.sharpe_ratio !== undefined && (
              <>
                <Divider />
                <Chip icon={<Target size={11} />} label={t.topbar.sharpe}>
                  <span className="mono" style={{ color: "var(--t1)", fontWeight: 500 }}>
                    {metrics.sharpe_ratio.toFixed(2)}
                  </span>
                </Chip>
              </>
            )}
          </>
        ) : (
          <>
            <Divider />
            <span style={{ color: "var(--t3)", fontSize: 11 }}>
              {t.topbar.buildFirstPortfolio}
            </span>
          </>
        )}
      </div>

      <div
        className="ml-auto pl-3 sm:pl-5 flex items-center gap-2 sm:gap-3 flex-shrink-0"
        style={{ borderLeft: "1px solid rgba(148,163,184,0.12)" }}
      >
        {/* Mode toggle: pill segmented control with sliding indicator */}
        <div
          className="hidden sm:flex relative items-center"
          style={{
            border: "1px solid var(--border)",
            background: "var(--bg-hover)",
            borderRadius: 999,
            padding: 3,
            height: 28,
          }}
        >
          {/* Sliding pill indicator */}
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 3,
              bottom: 3,
              left: mode === "simple" ? 3 : "calc(50% + 0px)",
              width: "calc(50% - 3px)",
              borderRadius: 999,
              background: "var(--orange)",
              boxShadow: "0 1px 2px rgba(0,0,0,0.18), 0 0 0 1px rgba(255,255,255,0.06) inset",
              transition: "left 0.22s cubic-bezier(.4,.0,.2,1), background 0.18s",
            }}
          />
          {(["simple", "advanced"] as const).map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                onClick={() => { if (mode !== m) toggleMode(); }}
                className="relative flex items-center justify-center gap-1.5 transition-colors"
                style={{
                  zIndex: 1,
                  padding: "0 12px",
                  height: 22,
                  minWidth: 76,
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  fontFamily: "Inter, system-ui, sans-serif",
                  textTransform: "none",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: active ? "#fff" : "var(--t2)",
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--t1)"; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--t2)"; }}
              >
                {m === "simple" ? <Sparkles size={11} /> : <Sliders size={11} />}
                {m === "simple" ? "Simple" : "Advanced"}
              </button>
            );
          })}
        </div>

        {/* Profile setup button */}
        <button
          onClick={openProfileModal}
          title="Edit investor profile"
          className="hidden sm:flex items-center justify-center transition-all"
          style={{
            width: 28, height: 28, borderRadius: 999,
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--t3)",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--orange-border)";
            (e.currentTarget as HTMLElement).style.background = "var(--orange-dim)";
            (e.currentTarget as HTMLElement).style.color = "var(--orange)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = "var(--t3)";
          }}
        >
          <UserCircle size={14} />
        </button>

        {/* Language toggle */}
        <button
          onClick={() => setLocale(locale === "en" ? "fr" : "en")}
          title={locale === "en" ? "Switch to French" : "Passer en anglais"}
          className="flex items-center justify-center transition-all"
          style={{
            height: 28, minWidth: 36, padding: "0 10px", borderRadius: 999,
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--t2)",
            fontSize: 10.5, fontWeight: 700, letterSpacing: "0.07em",
            fontFamily: "'JetBrains Mono', monospace",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--orange-border)";
            (e.currentTarget as HTMLElement).style.background = "var(--orange-dim)";
            (e.currentTarget as HTMLElement).style.color = "var(--orange)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = "var(--t2)";
          }}
        >
          {locale.toUpperCase()}
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          className="flex items-center gap-1.5 transition-all"
          style={{
            height: 28, padding: "0 10px", borderRadius: 999,
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--t2)",
            fontSize: 10.5, letterSpacing: "0.04em", fontWeight: 600,
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--orange-border)";
            (e.currentTarget as HTMLElement).style.background = "var(--orange-dim)";
            (e.currentTarget as HTMLElement).style.color = "var(--orange)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = "var(--t2)";
          }}
        >
          {theme === "dark"
            ? <><Sun size={11} /><span className="hidden sm:inline">{t.topbar.light}</span></>
            : <><Moon size={11} /><span className="hidden sm:inline">{t.topbar.dark}</span></>
          }
        </button>
      </div>
    </div>
  );
}

function Divider() {
  return (
    <span
      className="flex-shrink-0 mx-3 sm:mx-5"
      style={{ width: 1, height: 10, background: "rgba(148,163,184,0.14)" }}
    />
  );
}

function Chip({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap select-none">
      <span style={{ color: "var(--orange)", display: "inline-flex" }}>{icon}</span>
      <span style={{ color: "var(--t3)", fontSize: 10.5, letterSpacing: "0.07em" }}>{label}</span>
      <span style={{ fontSize: 11 }}>{children}</span>
    </span>
  );
}
