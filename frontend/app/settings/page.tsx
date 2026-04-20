"use client";

import { useEffect, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, put, del } from "@/lib/api";
import type { UserPreferences } from "@/lib/types";
import { useTheme } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import {
  Sun, Moon, Palette, DollarSign, BarChart2, Database,
  Info, Save, RotateCcw, Trash2, Download, Check, AlertTriangle,
  User, TrendingUp, Activity, Settings,
} from "lucide-react";
import toast from "react-hot-toast";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ACCENT_PRESETS = [
  { label: "Blue",   value: "#7AA7E8" },
  { label: "Green",  value: "#86B38A" },
  { label: "Gold",   value: "#C9B178" },
  { label: "Red",    value: "#D48585" },
  { label: "Purple", value: "#A97CC0" },
  { label: "Teal",   value: "#5BBCB8" },
  { label: "Orange", value: "#E8A87C" },
];

const TABS = [
  { id: "appearance",  label: "Appearance",   icon: Palette },
  { id: "defaults",    label: "Defaults",     icon: TrendingUp },
  { id: "simulation",  label: "Simulation",   icon: Activity },
  { id: "data",        label: "Data",         icon: Database },
  { id: "system",      label: "System",       icon: Info },
] as const;

type TabId = typeof TABS[number]["id"];

const DEFAULT_PREFS: UserPreferences = {
  accent_color:      "#7AA7E8",
  default_capital:   20000,
  currency:          "EUR",
  chart_template:    "plotly_dark",
  decimals:          2,
  ui_density:        "Normal",
  risk_free_rate:    0.04,
  default_benchmark: "SPY",
  default_method:    "Sharpe",
  mc_simulations:    500,
  data_horizon:      "5y",
  display_name:      "",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={className}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderTopColor: "var(--border-hi)",
        borderRadius: "var(--r-2xl, 16px)",
        padding: "20px 24px",
      }}
    >
      {children}
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--t2)" }}>{title}</p>
      {subtitle && <p className="text-xs mt-0.5" style={{ color: "var(--t3)" }}>{subtitle}</p>}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-3 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <div className="w-48 flex-shrink-0 pt-0.5">
        <p className="text-xs font-medium" style={{ color: "var(--t1)" }}>{label}</p>
        {hint && <p className="text-xs mt-0.5" style={{ color: "var(--t3)" }}>{hint}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Seg({
  options, value, onChange,
}: { options: { label: string; value: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div
      className="inline-flex rounded overflow-hidden border"
      style={{ borderColor: "var(--border)", background: "var(--bg-hover)" }}
    >
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className="px-4 py-1.5 text-xs font-medium transition-all"
          style={{
            background:  value === opt.value ? "var(--orange)" : "transparent",
            color:       value === opt.value ? "var(--bg-base)" : "var(--t2)",
            fontWeight:  value === opt.value ? 600 : 400,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function StyledSelect({ value, onChange, children }: {
  value: string | number; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="input-field text-xs"
      style={{ maxWidth: 240 }}
    >
      {children}
    </select>
  );
}

function StyledInput({ value, onChange, type = "text", placeholder, min, max, step }: {
  value: string | number; onChange: (v: string) => void;
  type?: string; placeholder?: string; min?: number; max?: number; step?: number;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      className="input-field text-xs"
      style={{ maxWidth: 240 }}
    />
  );
}

// ---------------------------------------------------------------------------
// Tab panels
// ---------------------------------------------------------------------------
function AppearanceTab({ prefs, onChange }: { prefs: UserPreferences; onChange: (p: Partial<UserPreferences>) => void }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-4">
      <Card>
        <SectionHeader title="Theme" subtitle="Applies instantly — persisted in browser" />

        <Row label="Color theme" hint="Dark recommended for extended use">
          <div className="flex items-center gap-3">
            <Seg
              options={[
                { label: "Dark",  value: "dark"  },
                { label: "Light", value: "light" },
              ]}
              value={theme}
              onChange={v => setTheme(v as "dark" | "light")}
            />
            <span style={{ color: "var(--t3)", fontSize: 11 }}>
              {theme === "dark" ? <Moon size={13} className="inline mr-1" /> : <Sun size={13} className="inline mr-1" />}
              Active: {theme === "dark" ? "Dark" : "Light"}
            </span>
          </div>
        </Row>

        <Row label="UI density" hint="Affects padding and spacing throughout">
          <Seg
            options={[
              { label: "Compact",  value: "Compact"  },
              { label: "Normal",   value: "Normal"   },
              { label: "Spacious", value: "Spacious" },
            ]}
            value={prefs.ui_density}
            onChange={v => onChange({ ui_density: v })}
          />
        </Row>
      </Card>

      <Card>
        <SectionHeader title="Accent color" subtitle="Used for active states, highlights, and key values" />

        <Row label="Preset swatches" hint="Click to apply">
          <div className="flex flex-wrap gap-2">
            {ACCENT_PRESETS.map(p => (
              <button
                key={p.value}
                onClick={() => onChange({ accent_color: p.value })}
                title={p.label}
                className="relative rounded-full transition-transform hover:scale-110"
                style={{
                  width: 28, height: 28,
                  background: p.value,
                  outline: prefs.accent_color === p.value ? `2px solid var(--t1)` : "none",
                  outlineOffset: 2,
                }}
              >
                {prefs.accent_color === p.value && (
                  <Check size={13} className="absolute inset-0 m-auto" style={{ color: "#fff" }} />
                )}
              </button>
            ))}
          </div>
        </Row>

        <Row label="Custom hex" hint="6-digit hex code">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={prefs.accent_color}
              onChange={e => onChange({ accent_color: e.target.value })}
              className="rounded cursor-pointer border"
              style={{ width: 36, height: 30, padding: 2, borderColor: "var(--border)", background: "var(--bg-hover)" }}
            />
            <input
              type="text"
              value={prefs.accent_color}
              onChange={e => {
                const v = e.target.value;
                if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) onChange({ accent_color: v });
              }}
              className="input-field text-xs font-mono uppercase"
              style={{ width: 100 }}
              maxLength={7}
              placeholder="#7AA7E8"
            />
            <div
              className="rounded"
              style={{
                width: 60, height: 30,
                background: prefs.accent_color,
                border: "1px solid var(--border)",
              }}
            />
          </div>
        </Row>
      </Card>
    </div>
  );
}

function DefaultsTab({ prefs, onChange }: { prefs: UserPreferences; onChange: (p: Partial<UserPreferences>) => void }) {
  return (
    <div className="space-y-4">
      <Card>
        <SectionHeader title="Profile" />
        <Row label="Display name" hint="Shown in PDF reports">
          <StyledInput
            value={prefs.display_name}
            onChange={v => onChange({ display_name: v })}
            placeholder="e.g. Leo Lombardini"
          />
        </Row>
      </Card>

      <Card>
        <SectionHeader title="Financial defaults" subtitle="Pre-filled in optimizer and reporting" />

        <Row label="Default capital" hint="Starting portfolio value (€)">
          <StyledInput
            type="number"
            value={prefs.default_capital}
            onChange={v => onChange({ default_capital: parseFloat(v) || 20000 })}
            min={100}
            step={1000}
          />
        </Row>

        <Row label="Display currency" hint="Shown in UI and PDF reports">
          <StyledSelect value={prefs.currency} onChange={v => onChange({ currency: v })}>
            <option value="EUR">EUR — Euro</option>
            <option value="USD">USD — US Dollar</option>
            <option value="GBP">GBP — British Pound</option>
            <option value="CHF">CHF — Swiss Franc</option>
            <option value="JPY">JPY — Japanese Yen</option>
            <option value="CAD">CAD — Canadian Dollar</option>
            <option value="AUD">AUD — Australian Dollar</option>
            <option value="CNY">CNY — Chinese Yuan</option>
          </StyledSelect>
        </Row>

        <Row label="Risk-free rate" hint="Used for Sharpe / Sortino / Calmar ratios (e.g. 0.04 = 4%)">
          <div className="flex items-center gap-2">
            <StyledInput
              type="number"
              value={prefs.risk_free_rate}
              onChange={v => onChange({ risk_free_rate: parseFloat(v) || 0.04 })}
              min={0}
              max={0.30}
              step={0.005}
            />
            <span className="text-xs font-mono" style={{ color: "var(--orange)" }}>
              = {((prefs.risk_free_rate ?? 0.04) * 100).toFixed(1)}%
            </span>
          </div>
        </Row>

        <Row label="Default benchmark" hint="Compared against in equity curve and PDF">
          <StyledSelect value={prefs.default_benchmark} onChange={v => onChange({ default_benchmark: v })}>
            <option value="SPY">SPY — S&amp;P 500</option>
            <option value="QQQ">QQQ — Nasdaq 100</option>
            <option value="MSCI_WORLD">MSCI World</option>
            <option value="STOXX50">EURO STOXX 50</option>
            <option value="DAX">DAX 40</option>
            <option value="NONE">None</option>
          </StyledSelect>
        </Row>

        <Row label="Default method" hint="Pre-selected in optimizer panel">
          <StyledSelect value={prefs.default_method} onChange={v => onChange({ default_method: v })}>
            <option value="Sharpe">Sharpe Maximization</option>
            <option value="MinRisk">Minimum Variance</option>
            <option value="EqualWeight">Equal Weight</option>
            <option value="MaxReturn">Maximum Return</option>
            <option value="RiskParity">Risk Parity</option>
          </StyledSelect>
        </Row>

        <Row label="Decimal places" hint="Precision shown in metric tables">
          <Seg
            options={[0,1,2,3,4].map(n => ({ label: String(n), value: String(n) }))}
            value={String(prefs.decimals)}
            onChange={v => onChange({ decimals: parseInt(v) })}
          />
        </Row>
      </Card>
    </div>
  );
}

function SimulationTab({ prefs, onChange }: { prefs: UserPreferences; onChange: (p: Partial<UserPreferences>) => void }) {
  return (
    <div className="space-y-4">
      <Card>
        <SectionHeader title="Monte Carlo" subtitle="Default parameters for PDF report generation" />

        <Row label="Simulations" hint="More paths = higher precision, slower generation">
          <div className="space-y-2">
            <Seg
              options={[
                { label: "250",   value: "250"  },
                { label: "500",   value: "500"  },
                { label: "1 000", value: "1000" },
                { label: "2 000", value: "2000" },
              ]}
              value={String(prefs.mc_simulations)}
              onChange={v => onChange({ mc_simulations: parseInt(v) })}
            />
            <p className="text-xs" style={{ color: "var(--t3)" }}>
              {prefs.mc_simulations <= 250  && "Fast — suitable for quick previews"}
              {prefs.mc_simulations === 500  && "Standard — recommended for most reports"}
              {prefs.mc_simulations === 1000 && "High precision — institutional grade"}
              {prefs.mc_simulations >= 2000  && "Maximum precision — slow, use for final reports"}
            </p>
          </div>
        </Row>
      </Card>

      <Card>
        <SectionHeader title="Market data" subtitle="Historical data window used for parameter estimation" />

        <Row label="Data horizon" hint="Lookback period for covariance and return estimation">
          <Seg
            options={[
              { label: "1Y",  value: "1y"  },
              { label: "2Y",  value: "2y"  },
              { label: "3Y",  value: "3y"  },
              { label: "5Y",  value: "5y"  },
              { label: "10Y", value: "10y" },
            ]}
            value={prefs.data_horizon}
            onChange={v => onChange({ data_horizon: v })}
          />
        </Row>
      </Card>

      <Card>
        <SectionHeader title="Chart rendering" />

        <Row label="Chart template" hint="Visual style for exported matplotlib charts (PDF)">
          <StyledSelect value={prefs.chart_template} onChange={v => onChange({ chart_template: v })}>
            <option value="plotly_dark">Plotly Dark</option>
            <option value="plotly">Plotly Light</option>
            <option value="ggplot2">ggplot2</option>
            <option value="seaborn">Seaborn</option>
          </StyledSelect>
        </Row>
      </Card>
    </div>
  );
}

function DataTab() {
  const PF_KEY      = "capitalis_portfolios_v2";
  const TRACKER_KEY = "capitalis_tracker_v2";

  const [pfCount,  setPfCount]  = useState(0);
  const [trCount,  setTrCount]  = useState(0);

  const refresh = useCallback(() => {
    try {
      const pfs = JSON.parse(localStorage.getItem(PF_KEY)  ?? "[]");
      const trs = JSON.parse(localStorage.getItem(TRACKER_KEY) ?? "[]");
      setPfCount(Array.isArray(pfs) ? pfs.length : 0);
      setTrCount(Array.isArray(trs) ? trs.length : 0);
    } catch {}
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  function clearKey(key: string, label: string) {
    localStorage.removeItem(key);
    toast.success(`${label} cleared.`);
    refresh();
  }

  function exportData() {
    const payload = {
      exported_at: new Date().toISOString(),
      portfolios:  JSON.parse(localStorage.getItem(PF_KEY)      ?? "[]"),
      tracker:     JSON.parse(localStorage.getItem(TRACKER_KEY) ?? "[]"),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `capitalis_export_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Data exported.");
  }

  function importData(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (data.portfolios) localStorage.setItem(PF_KEY, JSON.stringify(data.portfolios));
        if (data.tracker)    localStorage.setItem(TRACKER_KEY, JSON.stringify(data.tracker));
        toast.success("Data imported. Refresh page to see changes.");
        refresh();
      } catch {
        toast.error("Invalid export file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div className="space-y-4">
      <Card>
        <SectionHeader title="Local storage" subtitle="Portfolios and tracker data are stored in your browser" />

        <Row label="Optimizer portfolios" hint={`${pfCount} saved portfolios`}>
          <div className="flex items-center gap-3">
            <span
              className="text-xs font-mono font-semibold px-3 py-1 rounded"
              style={{ background: "var(--bg-hover)", color: "var(--orange)" }}
            >
              {pfCount} portfolio{pfCount !== 1 ? "s" : ""}
            </span>
            <button
              onClick={() => clearKey(PF_KEY, "Optimizer portfolios")}
              disabled={pfCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all disabled:opacity-40"
              style={{ background: "rgba(180,40,40,0.12)", color: "var(--red)", border: "1px solid rgba(180,40,40,0.20)" }}
            >
              <Trash2 size={11} /> Clear
            </button>
          </div>
        </Row>

        <Row label="Tracker portfolios" hint={`${trCount} saved portfolios`}>
          <div className="flex items-center gap-3">
            <span
              className="text-xs font-mono font-semibold px-3 py-1 rounded"
              style={{ background: "var(--bg-hover)", color: "var(--orange)" }}
            >
              {trCount} portfolio{trCount !== 1 ? "s" : ""}
            </span>
            <button
              onClick={() => clearKey(TRACKER_KEY, "Tracker portfolios")}
              disabled={trCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all disabled:opacity-40"
              style={{ background: "rgba(180,40,40,0.12)", color: "var(--red)", border: "1px solid rgba(180,40,40,0.20)" }}
            >
              <Trash2 size={11} /> Clear
            </button>
          </div>
        </Row>
      </Card>

      <Card>
        <SectionHeader title="Import / Export" subtitle="Backup and restore all your portfolio data" />

        <Row label="Export all data" hint="Downloads a JSON file with all portfolios and tracker data">
          <button
            onClick={exportData}
            className="flex items-center gap-2 px-4 py-2 rounded text-xs font-semibold transition-all"
            style={{ background: "var(--orange)", color: "var(--bg-base)" }}
          >
            <Download size={12} /> Export JSON
          </button>
        </Row>

        <Row label="Import data" hint="Restore from a previously exported JSON file">
          <label
            className="flex items-center gap-2 px-4 py-2 rounded text-xs font-semibold cursor-pointer transition-all"
            style={{
              background: "var(--bg-hover)",
              color: "var(--t1)",
              border: "1px solid var(--border)",
            }}
          >
            <Download size={12} style={{ transform: "rotate(180deg)" }} /> Import JSON
            <input type="file" accept=".json" onChange={importData} className="hidden" />
          </label>
        </Row>
      </Card>
    </div>
  );
}

function SystemTab() {
  const status = useQuery({
    queryKey: ["settings-status"],
    queryFn:  () => get("/settings/status"),
    staleTime: 30_000,
  });

  const ENV_LABELS: Record<string, string> = {
    ALPHA_VANTAGE_API_KEY: "Alpha Vantage — market data screener",
    FRED_API_KEY:          "FRED — macroeconomic data",
    JWT_SECRET_KEY:        "JWT — auth tokens",
    ALLOWED_ORIGINS:       "CORS — allowed frontend origins",
  };

  return (
    <div className="space-y-4">
      <Card>
        <SectionHeader title="Backend status" />

        {status.isLoading ? (
          <div className="flex items-center gap-2 py-4" style={{ color: "var(--t3)" }}>
            <LoadingSpinner size="sm" /> Checking…
          </div>
        ) : status.error ? (
          <p className="text-xs" style={{ color: "var(--red)" }}>Backend unreachable</p>
        ) : (
          <div className="space-y-0">
            <Row label="Backend version" hint="FastAPI">
              <span className="font-mono text-xs" style={{ color: "var(--orange)" }}>
                v{(status.data as any)?.backend_version ?? "—"}
              </span>
            </Row>
            <Row label="Data directory" hint="Preferences file storage">
              {(status.data as any)?.data_dir_exists ? (
                <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--green)" }}>
                  <Check size={11} /> Present
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--red)" }}>
                  <AlertTriangle size={11} /> Missing
                </span>
              )}
            </Row>
          </div>
        )}
      </Card>

      <Card>
        <SectionHeader title="API keys" subtitle="Configured as server environment variables — never exposed to frontend" />

        {status.isLoading ? (
          <div className="flex items-center gap-2 py-4" style={{ color: "var(--t3)" }}>
            <LoadingSpinner size="sm" /> Checking…
          </div>
        ) : (
          <div>
            {Object.entries((status.data as any)?.api_keys ?? {}).map(([key, present]) => (
              <Row key={key} label={key} hint={ENV_LABELS[key] ?? ""}>
                {present ? (
                  <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--green)" }}>
                    <Check size={11} /> Configured
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--yellow)" }}>
                    <AlertTriangle size={11} /> Not set — add to .env
                  </span>
                )}
              </Row>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionHeader title="Application" />
        <Row label="Frontend" hint="Next.js 14 App Router">
          <span className="text-xs font-mono" style={{ color: "var(--t2)" }}>v2.0.0</span>
        </Row>
        <Row label="Stack">
          <div className="flex flex-wrap gap-1.5">
            {["Next.js 14", "FastAPI", "TanStack Query", "Plotly.js", "fpdf2"].map(t => (
              <span
                key={t}
                className="text-xs px-2 py-0.5 rounded"
                style={{ background: "var(--bg-hover)", color: "var(--t2)", border: "1px solid var(--border)" }}
              >
                {t}
              </span>
            ))}
          </div>
        </Row>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function SettingsPage() {
  const { t } = useI18n();
  const qc  = useQueryClient();
  const [tab, setTab] = useState<TabId>("appearance");
  const [dirty, setDirty] = useState(false);

  const prefsQuery = useQuery<UserPreferences>({
    queryKey: ["user-prefs"],
    queryFn:  () => get("/settings/preferences"),
    staleTime: Infinity,
  });

  const [localPrefs, setLocalPrefs] = useState<UserPreferences>(DEFAULT_PREFS);

  useEffect(() => {
    if (prefsQuery.data) {
      setLocalPrefs({ ...DEFAULT_PREFS, ...prefsQuery.data });
      setDirty(false);
    }
  }, [prefsQuery.data]);

  const handleChange = useCallback((patch: Partial<UserPreferences>) => {
    setLocalPrefs(p => ({ ...p, ...patch }));
    setDirty(true);
  }, []);

  const saveMutation = useMutation({
    mutationFn: () => put("/settings/preferences", localPrefs),
    onSuccess: () => {
      toast.success("Preferences saved.");
      qc.invalidateQueries({ queryKey: ["user-prefs"] });
      setDirty(false);
    },
    onError: () => toast.error("Failed to save preferences."),
  });

  const resetMutation = useMutation({
    mutationFn: () => del("/settings/preferences"),
    onSuccess: () => {
      toast.success("Reset to defaults.");
      qc.invalidateQueries({ queryKey: ["user-prefs"] });
      setLocalPrefs(DEFAULT_PREFS);
      setDirty(false);
    },
    onError: () => toast.error("Failed to reset."),
  });

  return (
    <ErrorBoundary>
      <div className="p-4 sm:p-6 max-w-[900px] mx-auto fade-in">

        {/* Header */}
        <div className="mb-6 flex items-end justify-between border-b pb-5" style={{ borderColor: "var(--border)" }}>
          <div>
            <p className="text-xs tracking-widest uppercase mb-1" style={{ color: "var(--t3)" }}>
              {t.settings.breadcrumb}
            </p>
            <h1 className="text-xl font-semibold" style={{ color: "var(--t1)" }}>{t.settings.title}</h1>
          </div>

          {tab !== "data" && tab !== "system" && (
            <div className="flex items-center gap-2">
              {dirty && (
                <span className="text-xs px-2 py-1 rounded" style={{ background: "rgba(201,177,120,0.15)", color: "var(--yellow)" }}>
                  Unsaved changes
                </span>
              )}
              <button
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-medium transition-all disabled:opacity-40"
                style={{
                  background: "var(--bg-hover)",
                  color: "var(--t2)",
                  border: "1px solid var(--border)",
                }}
              >
                {resetMutation.isPending ? <LoadingSpinner size="sm" /> : <RotateCcw size={12} />}
                Reset
              </button>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !dirty}
                className="flex items-center gap-1.5 px-5 py-2 rounded font-semibold text-xs transition-all disabled:opacity-40"
                style={{ background: "var(--orange)", color: "var(--bg-base)" }}
              >
                {saveMutation.isPending ? <LoadingSpinner size="sm" /> : <Save size={12} />}
                {saveMutation.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </div>

        {prefsQuery.isLoading ? (
          <div className="flex items-center gap-2" style={{ color: "var(--t3)" }}>
            <LoadingSpinner size="sm" /> Loading preferences…
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">

            {/* Tab sidebar */}
            <nav className="col-span-1 md:col-span-3 space-y-1">
              {TABS.map(t => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded text-xs font-medium text-left transition-all"
                    style={{
                      background:  active ? "var(--orange-dim)" : "transparent",
                      color:       active ? "var(--orange)" : "var(--t2)",
                      borderLeft:  active ? "2px solid var(--orange)" : "2px solid transparent",
                    }}
                  >
                    <Icon size={13} />
                    {t.label}
                  </button>
                );
              })}
            </nav>

            {/* Tab content */}
            <div className="col-span-1 md:col-span-9">
              {tab === "appearance"  && <AppearanceTab  prefs={localPrefs} onChange={handleChange} />}
              {tab === "defaults"    && <DefaultsTab    prefs={localPrefs} onChange={handleChange} />}
              {tab === "simulation"  && <SimulationTab  prefs={localPrefs} onChange={handleChange} />}
              {tab === "data"        && <DataTab />}
              {tab === "system"      && <SystemTab />}
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
