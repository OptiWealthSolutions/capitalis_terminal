"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  Plus, Trash2, TrendingUp, TrendingDown, Wallet, RefreshCw, X, FolderPlus, Upload,
} from "lucide-react";
import { useRef } from "react";
import toast from "react-hot-toast";
import { useI18n } from "@/lib/i18n";
import { get, post, del, errMsg } from "@/lib/api";
import BrokerConnector from "@/components/BrokerConnector";
import ShareButton from "@/components/ShareButton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Position {
  id: string;
  ticker: string;
  shares: number;
  entry_price: number;
  entry_date: string;
  notes?: string;
}

interface TrackerPortfolio {
  id: string;
  name: string;
  createdAt: string;
  positions: Position[];
}

interface PriceHistory {
  ticker: string;
  dates: string[];
  close: number[];
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------
function fmtEur(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(v);
}
function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

const BLANK_FORM = (): Omit<Position, "id"> => ({
  ticker: "", shares: 0, entry_price: 0,
  entry_date: new Date().toISOString().slice(0, 10), notes: "",
});

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function TrackerPage() {
  const { t } = useI18n();
  const [portfolios, setPortfolios]       = useState<TrackerPortfolio[]>([]);
  const [activeId, setActiveId]           = useState<string | null>(null);
  const [newPfModal, setNewPfModal]       = useState(false);
  const [newPfName, setNewPfName]         = useState("");
  const [formOpen, setFormOpen]           = useState(false);
  const [form, setForm]                   = useState<Omit<Position, "id">>(BLANK_FORM());

  useEffect(() => {
    get<TrackerPortfolio[]>("/portfolio/tracker")
      .then((pfs) => {
        setPortfolios(pfs);
        if (pfs.length > 0) setActiveId(pfs[0].id);
      })
      .catch(() => {});
  }, []);

  const activePf = portfolios.find(p => p.id === activeId) ?? null;
  const positions = activePf?.positions ?? [];

  // ── Price queries for active portfolio positions ──
  const priceQueries = useQueries({
    queries: positions.map(p => ({
      queryKey: ["price_hist", p.ticker, "1mo"],
      queryFn: () => get<PriceHistory>(`/equity/${p.ticker}/history`, { period: "1mo", interval: "1d" }),
      staleTime: 5 * 60 * 1000,
      enabled: !!p.ticker,
    })),
  });

  const priceByTicker = useMemo(() => {
    const m: Record<string, number> = {};
    priceQueries.forEach((q, i) => {
      const data = q.data;
      if (data?.close?.length) m[positions[i]?.ticker] = data.close[data.close.length - 1];
    });
    return m;
  }, [priceQueries, positions]);

  const rows = useMemo(() => positions.map(p => {
    const cur    = priceByTicker[p.ticker] ?? null;
    const cost   = p.shares * p.entry_price;
    const mv     = cur !== null ? p.shares * cur : null;
    const pnl    = mv !== null ? mv - cost : null;
    const pnlPct = pnl !== null && cost > 0 ? (pnl / cost) * 100 : null;
    return { p, cur, cost, mv, pnl, pnlPct };
  }), [positions, priceByTicker]);

  const totals = useMemo(() => {
    let cost = 0, mv = 0, hasAll = true;
    for (const r of rows) {
      cost += r.cost;
      if (r.mv === null) { hasAll = false; } else { mv += r.mv; }
    }
    const pnl = hasAll ? mv - cost : null;
    const pct = hasAll && cost > 0 ? (pnl! / cost) * 100 : null;
    return { cost, mv: hasAll ? mv : null, pnl, pct };
  }, [rows]);

  const shareAllocation = useMemo(() => {
    const totalMv = rows.reduce((s, r) => s + (r.mv ?? r.cost), 0);
    if (totalMv <= 0) return { tickers: [] as string[], weights: [] as number[] };
    const tickers: string[] = [];
    const weights: number[] = [];
    for (const r of rows) {
      const v = r.mv ?? r.cost;
      if (v > 0) {
        tickers.push(r.p.ticker);
        weights.push((v / totalMv) * 100);
      }
    }
    return { tickers, weights };
  }, [rows]);

  // ── Portfolio management — server-side, user-scoped ──
  const createPortfolio = async () => {
    const name = newPfName.trim();
    if (!name) { toast.error("Name required."); return; }
    const pf: TrackerPortfolio = {
      id: crypto.randomUUID(), name, createdAt: new Date().toISOString(), positions: [],
    };
    try {
      await post("/portfolio/tracker", { id: pf.id, name: pf.name, positions: [], created_at: pf.createdAt });
      setPortfolios((prev) => [...prev, pf]);
      setActiveId(pf.id);
      setNewPfModal(false);
      setNewPfName("");
      toast.success(`Portfolio "${name}" created.`);
    } catch (err: any) {
      console.error("[tracker]", err);
      toast.error(errMsg(err?.response?.data?.detail));
    }
  };

  const deletePortfolio = async (id: string) => {
    try {
      await del(`/portfolio/tracker/${id}`);
      setPortfolios((prev) => {
        const next = prev.filter(p => p.id !== id);
        setActiveId(next[0]?.id ?? null);
        return next;
      });
      toast.success("Portfolio deleted.");
    } catch {
      toast.error("Failed to delete portfolio.");
    }
  };

  const updatePositions = async (pfId: string, newPositions: Position[]) => {
    const pf = portfolios.find(p => p.id === pfId);
    if (!pf) return;
    setPortfolios((prev) => prev.map(p => p.id === pfId ? { ...p, positions: newPositions } : p));
    try {
      await post("/portfolio/tracker", { id: pfId, name: pf.name, positions: newPositions, created_at: pf.createdAt });
    } catch {
      toast.error("Failed to sync positions.");
    }
  };

  // ── Position management ──
  const addPosition = () => {
    if (!activePf) return;
    if (!form.ticker.trim()) { toast.error("Ticker required."); return; }
    if (form.shares <= 0 || form.entry_price <= 0) { toast.error("Shares & entry price > 0."); return; }
    const newPos: Position = {
      id: crypto.randomUUID(),
      ticker: form.ticker.trim().toUpperCase(),
      shares: Number(form.shares),
      entry_price: Number(form.entry_price),
      entry_date: form.entry_date,
      notes: form.notes?.trim() || undefined,
    };
    updatePositions(activePf.id, [...positions, newPos]);
    setForm(BLANK_FORM());
    setFormOpen(false);
    toast.success(`Added ${newPos.ticker}`);
  };

  const removePosition = (posId: string) => {
    if (!activePf) return;
    updatePositions(activePf.id, positions.filter(p => p.id !== posId));
  };

  const refetchAll = () => priceQueries.forEach(q => q.refetch());

  const csvInputRef = useRef<HTMLInputElement>(null);

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activePf) { toast.error("Select a portfolio first."); return; }
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (!lines.length) { toast.error("CSV is empty."); return; }
        // Detect header: if first row contains letters in numeric columns, skip it
        const header = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/["']/g, ""));
        const hasHeader = isNaN(parseFloat(header[1]));
        const dataLines = hasHeader ? lines.slice(1) : lines;

        const imported: Position[] = [];
        for (const line of dataLines) {
          if (!line.trim()) continue;
          const cols = line.split(",").map(c => c.trim().replace(/^["']|["']$/g, ""));
          const ticker = (cols[0] ?? "").toUpperCase();
          const shares = parseFloat(cols[1] ?? "");
          const entryPrice = parseFloat(cols[2] ?? "");
          const entryDate = cols[3] ?? new Date().toISOString().slice(0, 10);
          if (!ticker || isNaN(shares) || isNaN(entryPrice)) continue;
          imported.push({ id: crypto.randomUUID(), ticker, shares, entry_price: entryPrice, entry_date: entryDate });
        }
        if (!imported.length) { toast.error("No valid rows found. Format: Ticker,Shares,EntryPrice,EntryDate"); return; }
        updatePositions(activePf.id, [...positions, ...imported]);
        toast.success(`Imported ${imported.length} position${imported.length > 1 ? "s" : ""}.`);
      } catch { toast.error("Failed to parse CSV."); }
      finally { if (csvInputRef.current) csvInputRef.current.value = ""; }
    };
    reader.readAsText(file);
  };

  // ---------------------------------------------------------------------------
  return (
    <div className="p-4 sm:p-6 xl:px-8 max-w-[2000px] mx-auto fade-in">

      {/* ── Header ── */}
      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--t1)" }}>{t.tracker.title}</h1>
          <p style={{ color: "var(--t2)", fontSize: "0.85rem", marginTop: 4 }}>
            {t.tracker.subtitle}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-secondary"
            onClick={refetchAll}
            disabled={positions.length === 0}
          >
            <RefreshCw size={13} /> Refresh
          </button>
          <button
            className="btn-secondary"
            onClick={() => setNewPfModal(true)}
          >
            <FolderPlus size={13} /> New portfolio
          </button>
          <BrokerConnector
            triggerLabel="Magic Import"
            variant="secondary"
            onImported={() => {
              get<TrackerPortfolio[]>("/portfolio/tracker")
                .then((pfs) => {
                  setPortfolios(pfs);
                  if (pfs.length > 0) setActiveId(pfs[0].id);
                })
                .catch(() => {});
            }}
          />
          {activePf && (
            <>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={handleCSVImport}
              />
              <button
                className="btn-secondary"
                onClick={() => csvInputRef.current?.click()}
                title="Import positions from CSV (Ticker,Shares,EntryPrice,EntryDate)"
              >
                <Upload size={13} /> Import CSV
              </button>
              <button className="btn-primary" onClick={() => setFormOpen(o => !o)}>
                <Plus size={14} /> Add position
              </button>
              {activePf && shareAllocation.tickers.length > 0 && (
                <ShareButton
                  label={activePf.name}
                  tickers={shareAllocation.tickers}
                  weights={shareAllocation.weights}
                  variant="compact"
                  text="Partager"
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Portfolio tabs ── */}
      {portfolios.length > 0 && (
        <div
          className="flex items-center gap-0 mb-5 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          {portfolios.map(pf => (
            <div key={pf.id} className="flex items-center group">
              <button
                onClick={() => setActiveId(pf.id)}
                className="flex items-center gap-1.5 pb-2.5 px-1 mr-5 text-xs border-b-2 -mb-px transition-colors"
                style={{
                  borderColor: activeId === pf.id ? "var(--orange)" : "transparent",
                  color: activeId === pf.id ? "var(--orange)" : "var(--t3)",
                  fontWeight: activeId === pf.id ? 600 : 400,
                }}
              >
                {pf.name}
                <span
                  className="text-xs"
                  style={{ color: activeId === pf.id ? "var(--orange)" : "var(--t3)", opacity: 0.7 }}
                >
                  ({pf.positions.length})
                </span>
              </button>
              <button
                onClick={() => deletePortfolio(pf.id)}
                className="opacity-0 group-hover:opacity-100 -ml-4 mr-3 mb-2.5 transition-opacity"
                style={{ color: "var(--t3)" }}
                title="Delete portfolio"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {portfolios.length === 0 ? (
        /* ── Empty state ── */
        <div
          className="flex flex-col items-center justify-center rounded border text-center"
          style={{
            borderColor: "var(--border)", borderStyle: "dashed",
            background: "var(--bg-card)", minHeight: 320, gap: 12,
          }}
        >
          <Wallet size={28} style={{ color: "var(--t3)" }} />
          <p style={{ color: "var(--t1)", fontWeight: 600 }}>No portfolios yet</p>
          <p style={{ color: "var(--t3)", fontSize: "0.82rem" }}>
            Create a portfolio to start tracking positions.
          </p>
          <button className="btn-primary mt-2" onClick={() => setNewPfModal(true)}>
            <FolderPlus size={13} /> Create portfolio
          </button>
        </div>
      ) : (
        <>
          {/* ── KPI tiles ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <StatTile label="Invested"     value={fmtEur(totals.cost)} icon={<Wallet size={14} />} />
            <StatTile label="Market value" value={fmtEur(totals.mv)}   icon={<TrendingUp size={14} />} />
            <StatTile
              label="P&L" value={fmtEur(totals.pnl)}
              tone={totals.pnl === null ? undefined : totals.pnl >= 0 ? "up" : "down"}
              icon={totals.pnl !== null && totals.pnl >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            />
            <StatTile
              label="Return" value={fmtPct(totals.pct)}
              tone={totals.pct === null ? undefined : totals.pct >= 0 ? "up" : "down"}
              icon={<TrendingUp size={14} />}
            />
          </div>

          {/* ── Add position form ── */}
          {formOpen && (
            <section className="card mb-5">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Field label="Ticker">
                  <input
                    className="input-field" placeholder="AAPL"
                    value={form.ticker}
                    onChange={e => setForm({ ...form, ticker: e.target.value.toUpperCase() })}
                  />
                </Field>
                <Field label="Shares">
                  <input
                    className="input-field" type="number" step="0.0001" min={0}
                    value={form.shares || ""}
                    onChange={e => setForm({ ...form, shares: parseFloat(e.target.value) || 0 })}
                  />
                </Field>
                <Field label="Entry price (€)">
                  <input
                    className="input-field" type="number" step="0.01" min={0}
                    value={form.entry_price || ""}
                    onChange={e => setForm({ ...form, entry_price: parseFloat(e.target.value) || 0 })}
                  />
                </Field>
                <Field label="Entry date">
                  <input
                    className="input-field" type="date"
                    value={form.entry_date}
                    onChange={e => setForm({ ...form, entry_date: e.target.value })}
                  />
                </Field>
                <Field label="Notes">
                  <input
                    className="input-field" placeholder="optional"
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                  />
                </Field>
              </div>
              <div className="flex justify-end gap-2 mt-3">
                <button className="btn-secondary" onClick={() => setFormOpen(false)}>Cancel</button>
                <button className="btn-primary" onClick={addPosition}>Add</button>
              </div>
            </section>
          )}

          {/* ── Positions table ── */}
          <section className="card" style={{ padding: 0, overflow: "hidden" }}>
            {rows.length === 0 ? (
              <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--t3)", fontSize: "0.85rem" }}>
                No positions in <strong style={{ color: "var(--t1)" }}>{activePf?.name}</strong>.
                Click <strong style={{ color: "var(--t1)" }}>Add position</strong> to start.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
              <table className="terminal-table">
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Entry date</th>
                    <th className="num">Shares</th>
                    <th className="num">Entry (€)</th>
                    <th className="num">Current (€)</th>
                    <th className="num">Cost</th>
                    <th className="num">Value</th>
                    <th className="num">P&L</th>
                    <th className="num">Return</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const tone = r.pnl === null ? "" : r.pnl >= 0 ? "delta-up" : "delta-down";
                    return (
                      <tr key={r.p.id}>
                        <td className="ticker">{r.p.ticker}</td>
                        <td style={{ color: "var(--t2)" }}>{r.p.entry_date}</td>
                        <td className="num">{r.p.shares}</td>
                        <td className="num">{r.p.entry_price.toFixed(2)}</td>
                        <td className="num">{r.cur !== null ? r.cur.toFixed(2) : "…"}</td>
                        <td className="num">{fmtEur(r.cost)}</td>
                        <td className="num">{fmtEur(r.mv)}</td>
                        <td className={`num ${tone}`}>{fmtEur(r.pnl)}</td>
                        <td className={`num ${tone}`}>{fmtPct(r.pnlPct)}</td>
                        <td>
                          <button
                            onClick={() => removePosition(r.p.id)}
                            className="btn-ghost" title="Remove"
                            style={{ padding: "4px 6px" }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* ── New portfolio modal ── */}
      {newPfModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
        >
          <div
            className="w-72 rounded-lg border p-6 space-y-4"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: "var(--t1)" }}>New Portfolio</span>
              <button onClick={() => setNewPfModal(false)} style={{ color: "var(--t3)" }}><X size={14} /></button>
            </div>
            <div className="space-y-1">
              <label className="text-xs" style={{ color: "var(--t3)" }}>Portfolio name</label>
              <input
                autoFocus
                value={newPfName}
                onChange={e => setNewPfName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && createPortfolio()}
                placeholder="e.g. Growth 2025"
                className="input-field"
              />
            </div>
            <button
              onClick={createPortfolio}
              disabled={!newPfName.trim()}
              className="btn-primary w-full disabled:opacity-40"
            >
              Create
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.06em",
        textTransform: "uppercase", color: "var(--t3)", marginBottom: 6,
      }}>{label}</div>
      {children}
    </div>
  );
}

function StatTile({ label, value, icon, tone }: {
  label: string; value: string; icon: React.ReactNode; tone?: "up" | "down";
}) {
  const color = tone === "up" ? "var(--green)" : tone === "down" ? "var(--red)" : "var(--t1)";
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border)",
      borderTopColor: "var(--border-hi)", borderRadius: "var(--r)",
      padding: "14px 16px", boxShadow: "var(--card-shadow)",
    }}>
      <div className="flex items-center gap-1.5" style={{
        color: "var(--t2)", fontSize: "0.65rem", fontWeight: 600,
        letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8,
      }}>
        <span style={{ color: "var(--orange)" }}>{icon}</span>
        {label}
      </div>
      <div className="mono" style={{ fontSize: "1.3rem", fontWeight: 600, color, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
        {value}
      </div>
    </div>
  );
}
