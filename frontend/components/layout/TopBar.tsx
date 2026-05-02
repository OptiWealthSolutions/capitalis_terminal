"use client";

import { useEffect, useState } from "react";
import { Sparkles, Briefcase, TrendingUp, Target, Sun, Moon, UserCircle, Sliders } from "lucide-react";
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
  onMenuToggle?: () => void;
}

export default function TopBar({ onMenuToggle: _onMenuToggle }: TopBarProps) {
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
      {/* Mobile-only brand chip (no sidebar on mobile, BottomNav handles it) */}
      <div className="flex sm:hidden items-center gap-2 mr-auto">
        <span style={{
          
          fontSize: 12, fontWeight: 700, letterSpacing: "0.04em",
          color: "var(--t1)",
        }}>
          CAPITALIS
        </span>
      </div>

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
        className="ml-auto pl-3 sm:pl-4 flex items-center gap-2 flex-shrink-0"
        style={{ borderLeft: "1px solid rgba(148,163,184,0.12)" }}
      >
        {/* Mode toggle: single uniform button toggling Simple ↔ Advanced */}
        <button
          onClick={toggleMode}
          title={mode === "simple" ? "Switch to Advanced" : "Switch to Simple"}
          aria-label={mode === "simple" ? "Switch to Advanced mode" : "Switch to Simple mode"}
          className="topbar-pill-btn hidden sm:flex items-center justify-center gap-1.5"
          style={{
            height: 28, padding: "0 12px", borderRadius: 999,
            color: "var(--t2)",
            fontSize: 11, fontWeight: 600, letterSpacing: "0.02em",
          }}
        >
          {mode === "simple"
            ? <><Sparkles size={12} /> Simple</>
            : <><Sliders size={12} /> Advanced</>
          }
        </button>

        {/* Profile setup button */}
        <button
          onClick={openProfileModal}
          title="Edit investor profile"
          aria-label="Edit investor profile"
          className="topbar-pill-btn hidden sm:flex items-center justify-center"
          style={{
            width: 28, height: 28, borderRadius: 999,
            color: "var(--t3)",
          }}
        >
          <UserCircle size={14} />
        </button>

        {/* Language toggle */}
        <button
          onClick={() => setLocale(locale === "en" ? "fr" : "en")}
          title={locale === "en" ? "Switch to French" : "Passer en anglais"}
          aria-label={locale === "en" ? "Switch to French" : "Switch to English"}
          className="topbar-pill-btn flex items-center justify-center"
          style={{
            height: 28, minWidth: 36, padding: "0 10px", borderRadius: 999,
            color: "var(--t2)",
            fontSize: 10.5, fontWeight: 700, letterSpacing: "0.07em",
          }}
        >
          {locale.toUpperCase()}
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          className="topbar-pill-btn flex items-center gap-1.5"
          style={{
            height: 28, padding: "0 10px", borderRadius: 999,
            color: "var(--t2)",
            fontSize: 10.5, letterSpacing: "0.04em", fontWeight: 600,
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
