"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useAuth } from "@/lib/auth";
import { post, get } from "@/lib/api";
import {
  UserCircle, CreditCard, Shield, CheckCircle, AlertCircle,
  ExternalLink, LogOut, Key, Eye, EyeOff, Save, Zap, Building2,
  Star, Lock, Bell, Trash2, Download, ChevronRight, Check,
} from "lucide-react";
import toast from "react-hot-toast";
import { useI18n } from "@/lib/i18n";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type PlanId = "free" | "pro" | "institutional";
type Tab    = "overview" | "billing" | "security";

interface Plan {
  id:        PlanId;
  name:      string;
  price:     string;
  billing:   string;
  badge?:    string;
  icon:      React.ReactNode;
  color:     string;
  features:  string[];
  limits:    { label: string; value: string }[];
}

// ---------------------------------------------------------------------------
// Plan definitions
// ---------------------------------------------------------------------------
const PLANS: Plan[] = [
  {
    id: "free", name: "Free", price: "€0", billing: "forever",
    icon: <Star size={16} />, color: "var(--t2)",
    features: [
      "Market overview dashboard",
      "3 screener runs / day",
      "Portfolio optimizer (HRP only)",
      "Portfolio tracker (1 portfolio)",
      "Basic equity analysis",
    ],
    limits: [
      { label: "Screener runs", value: "3 / day" },
      { label: "Optimizer methods", value: "1 (HRP)" },
      { label: "Tracker portfolios", value: "1" },
      { label: "PDF export", value: "—" },
      { label: "API access", value: "—" },
    ],
  },
  {
    id: "pro", name: "Pro", price: "€29", billing: "/ month",
    badge: "MOST POPULAR", icon: <Zap size={16} />, color: "var(--orange)",
    features: [
      "Everything in Free",
      "Unlimited screener + scorer",
      "All 5 optimization methods",
      "Monte Carlo & VaR/CVaR analysis",
      "ML alpha signals",
      "Institutional PDF reports",
      "API access (1 000 req/day)",
      "Tracker: unlimited portfolios",
    ],
    limits: [
      { label: "Screener runs", value: "Unlimited" },
      { label: "Optimizer methods", value: "All 5" },
      { label: "Tracker portfolios", value: "Unlimited" },
      { label: "PDF export", value: "Yes" },
      { label: "API access", value: "1 000 / day" },
    ],
  },
  {
    id: "institutional", name: "Institutional", price: "€149", billing: "/ month",
    icon: <Building2 size={16} />, color: "#A97CC0",
    features: [
      "Everything in Pro",
      "Unlimited API access",
      "Custom screener universe",
      "White-label PDF reports",
      "Priority support (SLA 4h)",
      "Team seats (up to 10)",
      "On-premise deployment",
      "Dedicated Slack channel",
    ],
    limits: [
      { label: "Screener runs", value: "Unlimited" },
      { label: "Optimizer methods", value: "All 5 + custom" },
      { label: "Tracker portfolios", value: "Unlimited" },
      { label: "PDF export", value: "White-label" },
      { label: "API access", value: "Unlimited" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderTopColor: "var(--border-hi)",
      borderRadius: "var(--r-2xl, 16px)",
      padding: "20px 24px",
      ...style,
    }}>
      {children}
    </div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: "var(--t3)" }}>
      {children}
    </p>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-2.5 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <span className="text-xs w-40 flex-shrink-0 pt-0.5" style={{ color: "var(--t3)" }}>{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-sections
// ---------------------------------------------------------------------------
function ProfileCard({ user }: { user: any }) {
  const [name, setName]     = useState(user?.display_name ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      // Save display_name through settings endpoint
      await post("/settings/preferences", { display_name: name });
      toast.success("Profile updated.");
    } catch {
      toast.error("Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const planColor =
    user?.subscription?.plan === "pro" ? "var(--orange)" :
    user?.subscription?.plan === "institutional" ? "#A97CC0" : "var(--t3)";

  return (
    <Card>
      <CardTitle>Profile</CardTitle>

      {/* Avatar + name row */}
      <div className="flex items-center gap-4 mb-5 pb-4 border-b" style={{ borderColor: "var(--border)" }}>
        <div
          className="flex items-center justify-center rounded-full flex-shrink-0"
          style={{
            width: 52, height: 52,
            background: "var(--orange-dim)",
            border: "1px solid var(--orange-border)",
          }}
        >
          <UserCircle size={26} style={{ color: "var(--orange)" }} />
        </div>
        <div>
          <p className="font-semibold" style={{ color: "var(--t1)" }}>
            {user?.display_name || user?.email?.split("@")[0] || "User"}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--t3)" }}>{user?.email ?? "—"}</p>
          <span
            className="text-xs font-semibold uppercase px-2 py-0.5 rounded mt-1 inline-block"
            style={{ background: `${planColor}18`, color: planColor, border: `1px solid ${planColor}33` }}
          >
            {user?.subscription?.plan ?? "Free"}
          </span>
        </div>
      </div>

      <FieldRow label="Display name">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="input-field text-xs flex-1"
            placeholder="Your name"
            style={{ maxWidth: 200 }}
          />
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all"
            style={{ background: "var(--orange)", color: "var(--bg-base)" }}
          >
            {saving ? <LoadingSpinner size="sm" /> : <Save size={11} />}
            Save
          </button>
        </div>
      </FieldRow>

      <FieldRow label="Email">
        <span className="text-xs font-mono" style={{ color: "var(--t1)" }}>{user?.email ?? "—"}</span>
      </FieldRow>

      <FieldRow label="Member since">
        <span className="text-xs" style={{ color: "var(--t2)" }}>
          {user?.created_at ? new Date(user.created_at).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" }) : "—"}
        </span>
      </FieldRow>

      {user?.subscription?.current_period_end && (
        <FieldRow label="Renews">
          <span className="text-xs" style={{ color: "var(--t2)" }}>
            {new Date(user.subscription.current_period_end).toLocaleDateString("en-GB")}
          </span>
        </FieldRow>
      )}
    </Card>
  );
}

function UsageCard() {
  const PF_KEY      = "capitalis_portfolios_v2";
  const TRACKER_KEY = "capitalis_tracker_v2";

  const [pfCount,  setPfCount]  = useState(0);
  const [trkCount, setTrkCount] = useState(0);

  useEffect(() => {
    try {
      setPfCount(JSON.parse(localStorage.getItem(PF_KEY)      ?? "[]").length);
      setTrkCount(JSON.parse(localStorage.getItem(TRACKER_KEY) ?? "[]").length);
    } catch {}
  }, []);

  const stats = [
    { label: "Optimizer portfolios", value: pfCount,  max: null  },
    { label: "Tracker portfolios",   value: trkCount, max: null  },
  ];

  return (
    <Card>
      <CardTitle>Usage</CardTitle>
      <div className="space-y-3">
        {stats.map(s => (
          <div key={s.label} className="flex items-center justify-between">
            <span className="text-xs" style={{ color: "var(--t2)" }}>{s.label}</span>
            <span className="text-xs font-mono font-semibold" style={{ color: "var(--orange)" }}>
              {s.value}{s.max ? ` / ${s.max}` : ""}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PlanCard({
  plan, isCurrent, onSelect,
}: { plan: Plan; isCurrent: boolean; onSelect: (id: PlanId) => void }) {
  const isPopular = plan.badge === "MOST POPULAR";
  return (
    <div
      className="relative flex flex-col rounded-2xl overflow-hidden transition-all"
      style={{
        background: isCurrent
          ? `${plan.color}0D`
          : "var(--bg-card)",
        border: `1px solid ${isCurrent ? plan.color + "66" : "var(--border)"}`,
        borderTopColor: isPopular ? plan.color : undefined,
        borderTopWidth: isPopular ? 2 : undefined,
      }}
    >
      {plan.badge && (
        <div
          className="absolute top-0 left-0 right-0 text-center py-1 text-xs font-semibold tracking-widest"
          style={{ background: plan.color, color: "var(--bg-base)", fontSize: 9 }}
        >
          {plan.badge}
        </div>
      )}

      <div className={`p-5 flex flex-col gap-4 flex-1 ${plan.badge ? "pt-8" : ""}`}>
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span style={{ color: plan.color }}>{plan.icon}</span>
            <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--t2)" }}>
              {plan.name}
            </span>
            {isCurrent && (
              <span className="text-xs px-1.5 py-0.5 rounded font-semibold" style={{ background: `${plan.color}22`, color: plan.color }}>
                Current
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-semibold" style={{ color: "var(--t1)" }}>{plan.price}</span>
            <span className="text-xs" style={{ color: "var(--t3)" }}>{plan.billing}</span>
          </div>
        </div>

        {/* Features */}
        <ul className="space-y-1.5 flex-1">
          {plan.features.map(f => (
            <li key={f} className="flex items-start gap-2 text-xs" style={{ color: "var(--t2)" }}>
              <Check size={11} className="mt-0.5 flex-shrink-0" style={{ color: plan.color }} />
              {f}
            </li>
          ))}
        </ul>

        {/* Limits */}
        <div className="rounded-lg overflow-hidden border" style={{ borderColor: "var(--border)" }}>
          {plan.limits.map((lim, i) => (
            <div
              key={lim.label}
              className="flex items-center justify-between px-3 py-1.5 text-xs"
              style={{
                background: i % 2 === 0 ? "var(--bg-hover)" : "transparent",
                borderBottom: i < plan.limits.length - 1 ? "1px solid var(--border)" : "none",
              }}
            >
              <span style={{ color: "var(--t3)" }}>{lim.label}</span>
              <span className="font-mono font-semibold" style={{ color: lim.value === "—" ? "var(--t3)" : plan.color }}>
                {lim.value}
              </span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={() => onSelect(plan.id)}
          disabled={isCurrent}
          className="w-full py-2.5 rounded-lg text-xs font-semibold transition-all disabled:cursor-not-allowed"
          style={isCurrent ? {
            background: "var(--bg-hover)", color: "var(--t3)", border: "1px solid var(--border)",
          } : {
            background: plan.color, color: "var(--bg-base)",
          }}
        >
          {isCurrent ? "Current plan" : plan.id === "free" ? "Downgrade" : "Upgrade →"}
        </button>
      </div>
    </div>
  );
}

function BillingTab({ currentPlan, onPortal }: { currentPlan: PlanId; onPortal: () => void }) {
  const [invoices, setInvoices] = useState<{ id: string; date: string; amount_eur: number; status: string; description?: string }[]>([]);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    setLoading(true);
    get<{ invoices: typeof invoices }>("/billing/invoices")
      .then(d => setInvoices(d.invoices))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Payment method</CardTitle>
        <div className="flex items-center gap-4 mb-4">
          <div
            className="flex items-center justify-center rounded-lg"
            style={{ width: 48, height: 32, background: "var(--bg-hover)", border: "1px solid var(--border)" }}
          >
            <CreditCard size={18} style={{ color: "var(--t2)" }} />
          </div>
          <div>
            <p className="text-sm" style={{ color: "var(--t1)" }}>
              {currentPlan === "free" ? "No payment method on file" : "Card on file — managed via Stripe"}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--t3)" }}>
              {currentPlan === "free" ? "Upgrade to Pro or Institutional to add a payment method." : "Update your card details in the Stripe customer portal."}
            </p>
          </div>
        </div>
        {currentPlan !== "free" && (
          <button
            onClick={onPortal}
            className="flex items-center gap-2 text-xs font-semibold transition-all"
            style={{ color: "var(--orange)" }}
          >
            <ExternalLink size={12} />
            Manage payment in Stripe Portal
            <ChevronRight size={12} />
          </button>
        )}
      </Card>

      <Card>
        <CardTitle>Invoice history</CardTitle>
        {loading ? (
          <div className="flex items-center gap-2 py-4" style={{ color: "var(--t3)" }}>
            <LoadingSpinner size="sm" /> Loading…
          </div>
        ) : invoices.length === 0 ? (
          <div className="py-8 text-center">
            <p style={{ color: "var(--t3)", fontSize: "0.82rem" }}>No invoices yet.</p>
            {currentPlan === "free" && (
              <p className="text-xs mt-1" style={{ color: "var(--t3)" }}>Invoices appear here once you subscribe to a paid plan.</p>
            )}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Date", "Description", "Amount", "Status"].map(h => (
                  <th key={h} className="pb-2.5 text-left font-semibold tracking-widest" style={{ color: "var(--t3)", fontSize: 10 }}>
                    {h.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="py-2.5 font-mono" style={{ color: "var(--t2)" }}>{inv.date}</td>
                  <td className="py-2.5" style={{ color: "var(--t2)" }}>{inv.description ?? "Subscription"}</td>
                  <td className="py-2.5 font-mono font-semibold" style={{ color: "var(--t1)" }}>€{inv.amount_eur.toFixed(2)}</td>
                  <td className="py-2.5">
                    <span
                      className="px-2 py-0.5 rounded text-xs font-semibold uppercase"
                      style={inv.status === "paid"
                        ? { background: "rgba(86,160,92,0.15)", color: "var(--green)" }
                        : { background: "rgba(201,177,120,0.15)", color: "var(--yellow)" }}
                    >
                      {inv.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div
        className="flex items-start gap-3 rounded-xl p-4"
        style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}
      >
        <AlertCircle size={13} style={{ color: "var(--yellow)", flexShrink: 0, marginTop: 1 }} />
        <p className="text-xs" style={{ color: "var(--t2)" }}>
          For refunds or billing issues contact{" "}
          <span style={{ color: "var(--orange)" }}>billing@capitalis.io</span>.
          Subscriptions renew automatically unless cancelled before the renewal date.
        </p>
      </div>
    </div>
  );
}

function SecurityTab() {
  const [current, setCurrent] = useState("");
  const [next,    setNext]    = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const submitPwd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) { toast.error("Passwords do not match."); return; }
    if (next.length < 8) { toast.error("Minimum 8 characters."); return; }
    setLoading(true);
    try {
      await post("/auth/change-password", { current_password: current, new_password: next });
      toast.success("Password updated.");
      setCurrent(""); setNext(""); setConfirm("");
    } catch {
      toast.error("Incorrect current password.");
    } finally { setLoading(false); }
  };

  const [apiKeys, setApiKeys] = useState({ fredApiKey: "", alphaVantageApiKey: "" });
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("capitalis_api_keys_v1") ?? "{}");
      setApiKeys({ fredApiKey: stored.fredApiKey ?? "", alphaVantageApiKey: stored.alphaVantageApiKey ?? "" });
    } catch {}
  }, []);

  const saveKeys = () => {
    localStorage.setItem("capitalis_api_keys_v1", JSON.stringify(apiKeys));
    toast.success("API keys saved locally.");
  };

  return (
    <div className="space-y-4">
      {/* Password */}
      <Card>
        <CardTitle>Change password</CardTitle>
        <form onSubmit={submitPwd} className="space-y-3 max-w-sm">
          {[
            { value: current, set: setCurrent, ph: "Current password" },
            { value: next,    set: setNext,    ph: "New password (min 8 chars)" },
            { value: confirm, set: setConfirm, ph: "Confirm new password" },
          ].map(f => (
            <div key={f.ph} className="relative">
              <input
                type={showPwd ? "text" : "password"}
                value={f.value}
                onChange={e => f.set(e.target.value)}
                placeholder={f.ph}
                className="input-field text-xs w-full pr-9"
                required
              />
              <button
                type="button"
                onClick={() => setShowPwd(s => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2"
                style={{ color: "var(--t3)" }}
              >
                {showPwd ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          ))}
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded text-xs font-semibold transition-all disabled:opacity-40"
            style={{ background: "var(--orange)", color: "var(--bg-base)" }}
          >
            {loading ? <LoadingSpinner size="sm" /> : <Lock size={12} />}
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>
      </Card>

      {/* 2FA */}
      <Card>
        <CardTitle>Two-factor authentication</CardTitle>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--t1)" }}>TOTP Authenticator</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--t3)" }}>Google Authenticator, Authy, 1Password</p>
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle size={12} style={{ color: "var(--yellow)" }} />
            <span className="text-xs" style={{ color: "var(--yellow)" }}>Not enabled</span>
          </div>
        </div>
        <button
          onClick={() => toast("2FA coming in next release.")}
          className="mt-4 w-full py-2 rounded text-xs font-semibold transition-all"
          style={{ background: "var(--bg-hover)", color: "var(--t2)", border: "1px solid var(--border)" }}
        >
          Enable 2FA
        </button>
      </Card>

      {/* Data provider API keys */}
      <Card>
        <CardTitle>Data provider API keys</CardTitle>
        <p className="text-xs mb-4" style={{ color: "var(--t3)" }}>
          Stored in your browser only. Never transmitted to third parties.
        </p>
        <div className="space-y-3 max-w-md">
          {[
            { id: "fredApiKey" as const, label: "FRED API KEY", ph: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", hint: "fred.stlouisfed.org — macro indicators" },
            { id: "alphaVantageApiKey" as const, label: "ALPHA VANTAGE KEY", ph: "XXXXXXXXXXXXXXXX", hint: "alphavantage.co — earnings fallback" },
          ].map(f => (
            <div key={f.id}>
              <p className="text-xs font-medium mb-1.5" style={{ color: "var(--t2)" }}>{f.label}</p>
              <div className="flex gap-2">
                <input
                  type={showKeys[f.id] ? "text" : "password"}
                  value={apiKeys[f.id]}
                  onChange={e => setApiKeys(k => ({ ...k, [f.id]: e.target.value }))}
                  placeholder={f.ph}
                  className="input-field text-xs font-mono flex-1"
                />
                <button
                  onClick={() => setShowKeys(s => ({ ...s, [f.id]: !s[f.id] }))}
                  className="px-2.5 rounded border transition-all"
                  style={{ borderColor: "var(--border)", color: "var(--t3)", background: "var(--bg-hover)" }}
                >
                  {showKeys[f.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--t3)" }}>{f.hint}</p>
            </div>
          ))}
        </div>
        <button
          onClick={saveKeys}
          className="flex items-center gap-2 px-4 py-2 rounded text-xs font-semibold transition-all mt-4"
          style={{ background: "var(--orange)", color: "var(--bg-base)" }}
        >
          <Save size={12} /> Save keys
        </button>
      </Card>

      {/* Danger zone */}
      <div
        className="rounded-xl p-5"
        style={{ background: "rgba(180,40,40,0.06)", border: "1px solid rgba(180,40,40,0.25)" }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Shield size={13} style={{ color: "var(--red)" }} />
          <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--red)" }}>Danger zone</span>
        </div>
        <p className="text-xs mb-4" style={{ color: "var(--t2)" }}>
          Permanently delete your account and all associated data. This action cannot be undone.
          All saved portfolios, tracker data, and preferences will be lost.
        </p>
        <button
          onClick={() => toast.error("Account deletion requires email confirmation. Contact support@capitalis.io.")}
          className="flex items-center gap-2 px-4 py-2 rounded text-xs font-semibold transition-all"
          style={{ background: "rgba(180,40,40,0.12)", color: "var(--red)", border: "1px solid rgba(180,40,40,0.30)" }}
        >
          <Trash2 size={12} /> Delete account
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function AccountPage() {
  const router     = useRouter();
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [tab, setTab]    = useState<Tab>("overview");

  const currentPlan = (user?.subscription?.plan ?? "free") as PlanId;

  const handleLogout = () => { logout(); router.replace("/login"); };

  const handlePlanSelect = async (planId: PlanId) => {
    if (planId === currentPlan) return;
    if (planId === "free") { toast("Contact support to downgrade."); return; }
    try {
      const { url } = await post<{ url: string }>("/billing/checkout-session", { plan_id: planId });
      window.location.href = url;
    } catch {
      toast.error("Stripe not configured — set STRIPE_SECRET_KEY in backend .env");
    }
  };

  const handlePortal = async () => {
    try {
      const { url } = await post<{ url: string }>("/billing/portal-session", {});
      window.location.href = url;
    } catch {
      toast.error("No active subscription or Stripe not configured.");
    }
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <UserCircle size={13} /> },
    { id: "billing",  label: "Billing",  icon: <CreditCard size={13} /> },
    { id: "security", label: "Security", icon: <Shield size={13} /> },
  ];

  return (
    <ErrorBoundary>
      <div className="p-4 sm:p-6 max-w-[1100px] mx-auto fade-in">

        {/* Header */}
        <div className="mb-6 flex items-end justify-between border-b pb-5" style={{ borderColor: "var(--border)" }}>
          <div>
            <p className="text-xs tracking-widest uppercase mb-1" style={{ color: "var(--t3)" }}>{t.account.breadcrumb}</p>
            <h1 className="text-xl font-semibold" style={{ color: "var(--t1)" }}>{t.account.title}</h1>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs font-medium transition-all"
            style={{ color: "var(--t3)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--red)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--t3)")}
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: "var(--bg-hover)", width: "fit-content" }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all"
              style={tab === t.id ? {
                background: "var(--bg-card)",
                color: "var(--orange)",
                boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
              } : {
                color: "var(--t2)",
                background: "transparent",
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ── Overview tab ── */}
        {tab === "overview" && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="col-span-1 lg:col-span-4 space-y-4">
                <ProfileCard user={user} />
                <UsageCard />
              </div>
              <div className="col-span-1 lg:col-span-8">
                <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "var(--t3)" }}>
                  Subscription plans
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {PLANS.map(plan => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      isCurrent={plan.id === currentPlan}
                      onSelect={handlePlanSelect}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Billing tab ── */}
        {tab === "billing" && (
          <BillingTab currentPlan={currentPlan} onPortal={handlePortal} />
        )}

        {/* ── Security tab ── */}
        {tab === "security" && <SecurityTab />}
      </div>
    </ErrorBoundary>
  );
}
