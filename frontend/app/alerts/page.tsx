"use client";

import { useState, useEffect } from "react";
import { get, post, patch, del } from "@/lib/api";
import { Bell, Plus, Trash2, ToggleLeft, ToggleRight, TrendingUp, TrendingDown, Calendar } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useI18n } from "@/lib/i18n";
import toast from "react-hot-toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type AlertType = "price_above" | "price_below" | "earnings_date";

interface Alert {
  id: string;
  ticker: string;
  alert_type: AlertType;
  price: number | null;
  days_before: number | null;
  note: string | null;
  is_active: boolean;
  triggered_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AlertsPage() {
  const { t } = useI18n();
  const [alerts, setAlerts]         = useState<Alert[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);

  // Form state
  const [ticker, setTicker]         = useState("");
  const [alertType, setAlertType]   = useState<AlertType>("price_above");
  const [price, setPrice]           = useState<string>("");
  const [daysBefore, setDaysBefore] = useState<string>("1");
  const [note, setNote]             = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchAlerts();
  }, []);

  function fetchAlerts() {
    setLoading(true);
    get<Alert[]>("/alerts")
      .then(setAlerts)
      .catch(() => toast.error("Failed to load alerts"))
      .finally(() => setLoading(false));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!ticker.trim()) { toast.error("Ticker required"); return; }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        ticker: ticker.trim().toUpperCase(),
        alert_type: alertType,
        note: note || null,
      };
      if (alertType === "price_above" || alertType === "price_below") {
        if (!price) { toast.error("Price required"); setSubmitting(false); return; }
        body.price = parseFloat(price);
      }
      if (alertType === "earnings_date") {
        body.days_before = parseInt(daysBefore) || 1;
      }
      await post("/alerts", body);
      toast.success("Alert created");
      setShowForm(false);
      setTicker(""); setPrice(""); setNote(""); setDaysBefore("1");
      fetchAlerts();
    } catch {
      toast.error("Failed to create alert");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(alert: Alert) {
    try {
      await patch(`/alerts/${alert.id}`, { is_active: !alert.is_active });
      setAlerts((prev) => prev.map((a) => a.id === alert.id ? { ...a, is_active: !a.is_active } : a));
    } catch {
      toast.error("Failed to update alert");
    }
  }

  async function handleDelete(id: string) {
    try {
      await del(`/alerts/${id}`);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      toast.success("Alert deleted");
    } catch {
      toast.error("Failed to delete alert");
    }
  }

  const active   = alerts.filter((a) => a.is_active && !a.triggered_at);
  const fired    = alerts.filter((a) => a.triggered_at);
  const inactive = alerts.filter((a) => !a.is_active && !a.triggered_at);

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8" style={{ background: "var(--bg-base)", color: "var(--t1)" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs tracking-widest mb-1" style={{ color: "var(--t3)", fontFamily: "monospace" }}>
            Capital / Alerts
          </p>
          <h1 className="text-xl font-bold tracking-wide" style={{ fontFamily: "monospace" }}>
            {t.nav.alerts}
          </h1>
          <p className="text-xs mt-1" style={{ color: "var(--t3)" }}>
            Price &amp; earnings alerts — notified by email when triggered
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded text-xs font-semibold tracking-wider transition-all"
          style={{ background: "var(--orange)", color: "#fff" }}
        >
          <Plus size={13} />
          New Alert
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border p-5 mb-6"
          style={{ background: "var(--bg-panel)", borderColor: "var(--border)" }}
        >
          <p className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: "var(--t3)" }}>
            Create Alert
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Ticker */}
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--t3)" }}>Ticker</label>
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="AAPL"
                maxLength={10}
                className="w-full rounded border px-3 py-2 text-xs"
                style={{ background: "var(--bg-hover)", borderColor: "var(--border)", color: "var(--t1)" }}
              />
            </div>

            {/* Alert type */}
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--t3)" }}>Type</label>
              <select
                value={alertType}
                onChange={(e) => setAlertType(e.target.value as AlertType)}
                className="w-full rounded border px-3 py-2 text-xs"
                style={{ background: "var(--bg-hover)", borderColor: "var(--border)", color: "var(--t1)" }}
              >
                <option value="price_above">Price above</option>
                <option value="price_below">Price below</option>
                <option value="earnings_date">Earnings date</option>
              </select>
            </div>

            {/* Price / days before */}
            {(alertType === "price_above" || alertType === "price_below") ? (
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--t3)" }}>Target price</label>
                <input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="150.00"
                  className="w-full rounded border px-3 py-2 text-xs"
                  style={{ background: "var(--bg-hover)", borderColor: "var(--border)", color: "var(--t1)" }}
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--t3)" }}>Alert N days before</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={daysBefore}
                  onChange={(e) => setDaysBefore(e.target.value)}
                  className="w-full rounded border px-3 py-2 text-xs"
                  style={{ background: "var(--bg-hover)", borderColor: "var(--border)", color: "var(--t1)" }}
                />
              </div>
            )}

            {/* Note */}
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--t3)" }}>Note (optional)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                placeholder="Optional note…"
                className="w-full rounded border px-3 py-2 text-xs"
                style={{ background: "var(--bg-hover)", borderColor: "var(--border)", color: "var(--t1)" }}
              />
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 rounded text-xs font-semibold tracking-wider disabled:opacity-50"
              style={{ background: "var(--orange)", color: "#fff" }}
            >
              {submitting ? <LoadingSpinner size="sm" /> : <Bell size={12} />}
              Create
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded text-xs"
              style={{ background: "var(--bg-hover)", color: "var(--t2)", border: "1px solid var(--border)" }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
      ) : alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Bell size={32} style={{ color: "var(--t3)" }} />
          <p className="text-sm" style={{ color: "var(--t3)" }}>No alerts yet. Create one above.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <Section title="Active" count={active.length} color="var(--green)">
              {active.map((a) => <AlertRow key={a.id} alert={a} onToggle={handleToggle} onDelete={handleDelete} />)}
            </Section>
          )}
          {fired.length > 0 && (
            <Section title="Triggered" count={fired.length} color="var(--orange)">
              {fired.map((a) => <AlertRow key={a.id} alert={a} onToggle={handleToggle} onDelete={handleDelete} />)}
            </Section>
          )}
          {inactive.length > 0 && (
            <Section title="Paused" count={inactive.length} color="var(--t3)">
              {inactive.map((a) => <AlertRow key={a.id} alert={a} onToggle={handleToggle} onDelete={handleDelete} />)}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function Section({ title, count, color, children }: {
  title: string; count: number; color: string; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--t3)", fontFamily: "monospace" }}>
          {title}
        </span>
        <span className="text-xs rounded px-1.5 py-0.5" style={{ background: "var(--bg-hover)", color: "var(--t3)" }}>
          {count}
        </span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function AlertRow({ alert, onToggle, onDelete }: {
  alert: Alert;
  onToggle: (a: Alert) => void;
  onDelete: (id: string) => void;
}) {
  const typeIcon = alert.alert_type === "price_above"
    ? <TrendingUp size={13} style={{ color: "var(--green)" }} />
    : alert.alert_type === "price_below"
    ? <TrendingDown size={13} style={{ color: "var(--red)" }} />
    : <Calendar size={13} style={{ color: "var(--orange)" }} />;

  const typeLabel = alert.alert_type === "price_above"
    ? `> ${alert.price}`
    : alert.alert_type === "price_below"
    ? `< ${alert.price}`
    : `${alert.days_before}d before earnings`;

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-lg border"
      style={{
        background: "var(--bg-panel)",
        borderColor: alert.triggered_at ? "var(--orange-border)" : "var(--border)",
        opacity: !alert.is_active && !alert.triggered_at ? 0.55 : 1,
      }}
    >
      <span className="flex-shrink-0">{typeIcon}</span>

      <span
        className="font-bold text-sm w-16 flex-shrink-0"
        style={{ fontFamily: "monospace", color: "var(--t1)" }}
      >
        {alert.ticker}
      </span>

      <span className="text-xs flex-shrink-0" style={{ color: "var(--t2)" }}>
        {typeLabel}
      </span>

      {alert.note && (
        <span className="text-xs truncate flex-1" style={{ color: "var(--t3)" }}>
          {alert.note}
        </span>
      )}

      {alert.triggered_at && (
        <span className="text-xs ml-auto flex-shrink-0 rounded px-2 py-0.5" style={{ background: "var(--orange-dim)", color: "var(--orange)" }}>
          Fired {new Date(alert.triggered_at).toLocaleDateString()}
        </span>
      )}

      <div className="ml-auto flex-shrink-0 flex items-center gap-2">
        <button
          onClick={() => onToggle(alert)}
          title={alert.is_active ? "Pause" : "Activate"}
          style={{ color: alert.is_active ? "var(--green)" : "var(--t3)" }}
        >
          {alert.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
        </button>
        <button
          onClick={() => onDelete(alert.id)}
          title="Delete"
          style={{ color: "var(--t3)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--red)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--t3)"; }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
