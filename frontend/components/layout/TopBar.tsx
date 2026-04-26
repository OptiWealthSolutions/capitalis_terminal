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

      <span className="hidden sm:flex items-center gap-2" style={{ color: "var(--t3)", fontSize: 10.5, letterSpacing: "0.07em" }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "var(--t1)", fontSize: 11 }}>Capitalis</span>
        <span style={{ color: "var(--border)" }}>·</span>
        <span style={{ fontSize: 10, letterSpacing: "0.06em" }}>by Horacle Capital</span>
      </span>

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
        <span className="live-dot" />
        <span className="hidden sm:inline" style={{ fontSize: 10.5, color: "var(--t3)", letterSpacing: "0.10em" }}>
          {t.topbar.live}
        </span>

        {/* Mode toggle: SIMPLE ↔ ADVANCED */}
        <div
          className="hidden sm:flex items-center rounded-lg overflow-hidden"
          style={{ border: "1px solid var(--border)", background: "var(--bg-hover)" }}
        >
          {(["simple", "advanced"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { if (mode !== m) toggleMode(); }}
              className="flex items-center gap-1.5 px-2.5 py-1 transition-all"
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                fontFamily: "'JetBrains Mono', monospace",
                background: mode === m ? (m === "simple" ? "var(--orange)" : "var(--bg-base)") : "transparent",
                color: mode === m ? (m === "simple" ? "#fff" : "var(--t1)") : "var(--t3)",
              }}
            >
              {m === "simple" ? <><Sparkles size={9} /> SIMPLE</> : <><Sliders size={9} /> ADVANCED</>}
            </button>
          ))}
        </div>

        {/* Profile setup button */}
        <button
          onClick={openProfileModal}
          title="Edit investor profile"
          className="hidden sm:flex items-center justify-center rounded-lg border transition-all"
          style={{
            width: 28, height: 28,
            background: "var(--bg-hover)",
            borderColor: "var(--border)",
            color: "var(--t3)",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--orange)";
            (e.currentTarget as HTMLElement).style.color = "var(--orange)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
            (e.currentTarget as HTMLElement).style.color = "var(--t3)";
          }}
        >
          <UserCircle size={13} />
        </button>

        {/* Language toggle */}
        <button
          onClick={() => setLocale(locale === "en" ? "fr" : "en")}
          title={locale === "en" ? "Switch to French" : "Passer en anglais"}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded border transition-all"
          style={{
            background: "var(--orange-dim)",
            borderColor: "var(--orange-border)",
            color: "var(--orange)",
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: "0.07em",
            fontFamily: "'JetBrains Mono', monospace",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = "var(--orange)";
            (e.currentTarget as HTMLElement).style.color = "#fff";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = "var(--orange-dim)";
            (e.currentTarget as HTMLElement).style.color = "var(--orange)";
          }}
        >
          {locale.toUpperCase()}
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded border transition-all"
          style={{
            background: "var(--bg-hover)",
            borderColor: "var(--border)",
            color: "var(--t2)",
            fontSize: 10.5,
            letterSpacing: "0.07em",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--orange)";
            (e.currentTarget as HTMLElement).style.color = "var(--orange)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
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
