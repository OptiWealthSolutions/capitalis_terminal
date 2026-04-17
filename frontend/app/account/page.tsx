"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { post, get } from "@/lib/api";
import {
  UserCircle,
  CreditCard,
  Shield,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  LogOut,
  Key,
  Eye,
  EyeOff,
  Save,
} from "lucide-react";
import toast from "react-hot-toast";

type PlanId = "free" | "pro" | "institutional";
type Tab = "overview" | "billing" | "security";

interface Plan {
  id: PlanId;
  name: string;
  price: string;
  billing: string;
  features: string[];
  highlight?: boolean;
}

interface ApiKeys {
  fredApiKey: string;
  alphaVantageApiKey: string;
}

const STORAGE_KEY = "capitalis_api_keys_v1";

const PLANS: Plan[] = [
  {
    id: "free",
    name: "FREE",
    price: "€0",
    billing: "forever",
    features: [
      "Macro dashboard (read-only)",
      "3 screener runs / day",
      "Portfolio optimizer (HRP only)",
      "No export",
    ],
  },
  {
    id: "pro",
    name: "PRO",
    price: "€29",
    billing: "per month",
    highlight: true,
    features: [
      "All FREE features",
      "Unlimited screener + scorer",
      "All 5 optimization methods",
      "Monte Carlo & VaR/CVaR",
      "ML Alpha signals",
      "PDF export",
      "API access (1 000 req/day)",
    ],
  },
  {
    id: "institutional",
    name: "INSTITUTIONAL",
    price: "€149",
    billing: "per month",
    features: [
      "All PRO features",
      "Unlimited API access",
      "Custom screener universe",
      "White-label reports",
      "Priority support (SLA 4h)",
      "Team seats (up to 10)",
      "On-premise deployment option",
    ],
  },
];

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-text-secondary text-xs uppercase tracking-widest mb-3">
      {children}
    </div>
  );
}

function SectionBox({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-bg-secondary border border-bg-border rounded-md p-5 space-y-4 shadow-card", className)}>
      {children}
    </div>
  );
}

function PlanCard({
  plan,
  isCurrent,
  onSelect,
}: {
  plan: Plan;
  isCurrent: boolean;
  onSelect: (id: PlanId) => void;
}) {
  return (
    <div
      className={cn(
        "border rounded-md p-5 flex flex-col gap-4 relative",
        plan.highlight ? "border-accent-blue bg-bg-tertiary" : "border-bg-border bg-bg-secondary",
        isCurrent && "ring-1 ring-accent-blue"
      )}
    >
      {plan.highlight && (
        <span className="absolute top-3 right-3 text-xs bg-accent-blue text-black px-2 py-0.5 font-semibold tracking-wider rounded">
          POPULAR
        </span>
      )}
      {isCurrent && (
        <span className="absolute top-3 left-3 text-xs bg-accent-green/20 text-accent-green border border-accent-green/30 px-2 py-0.5 rounded">
          CURRENT
        </span>
      )}
      <div className="mt-6">
        <div className="text-text-muted text-xs tracking-widest uppercase">{plan.name}</div>
        <div className="text-text-primary text-2xl font-semibold mt-1">
          {plan.price}
          <span className="text-text-secondary text-xs font-normal ml-1">/ {plan.billing}</span>
        </div>
      </div>
      <ul className="space-y-1.5 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-xs text-text-secondary">
            <CheckCircle size={11} className="text-accent-green mt-0.5 shrink-0" />
            {f}
          </li>
        ))}
      </ul>
      <button
        onClick={() => onSelect(plan.id)}
        disabled={isCurrent}
        className={cn(
          "w-full py-2 text-xs font-medium transition-all rounded-md",
          isCurrent
            ? "bg-bg-border text-text-muted cursor-not-allowed"
            : plan.highlight
            ? "bg-accent-blue hover:bg-orange-600 text-black hover:shadow-glow"
            : "border border-bg-border text-text-secondary hover:border-accent-blue hover:text-text-primary"
        )}
      >
        {isCurrent ? "CURRENT PLAN" : plan.id === "free" ? "DOWNGRADE" : "UPGRADE"}
      </button>
    </div>
  );
}

function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKeys>({ fredApiKey: "", alphaVantageApiKey: "" });
  const [show, setShow] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
      setKeys({ fredApiKey: stored.fredApiKey ?? "", alphaVantageApiKey: stored.alphaVantageApiKey ?? "" });
    } catch { /* ignore */ }
  }, []);

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
    toast.success("API keys saved locally.");
  };

  const fields: { id: keyof ApiKeys; label: string; placeholder: string; hint: string }[] = [
    {
      id: "fredApiKey",
      label: "FRED API KEY",
      placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      hint: "Used for macro indicators (GDP, CPI, rates). Get yours at fred.stlouisfed.org.",
    },
    {
      id: "alphaVantageApiKey",
      label: "ALPHA VANTAGE API KEY",
      placeholder: "XXXXXXXXXXXXXXXX",
      hint: "Used for earnings data fallback. Free tier available at alphavantage.co.",
    },
  ];

  return (
    <SectionBox>
      <Label>DATA PROVIDER API KEYS</Label>
      <p className="text-text-muted text-xs -mt-2">
        Stored in your browser. Never transmitted to third parties.
      </p>
      <div className="space-y-4">
        {fields.map((f) => (
          <div key={f.id} className="space-y-1.5">
            <div className="text-text-secondary text-xs font-medium">{f.label}</div>
            <div className="flex items-center gap-2">
              <input
                type={show[f.id] ? "text" : "password"}
                value={keys[f.id]}
                onChange={(e) => setKeys((prev) => ({ ...prev, [f.id]: e.target.value }))}
                placeholder={f.placeholder}
                className="flex-1 bg-bg-tertiary border border-bg-border rounded-md text-text-primary text-xs px-3 py-2 focus:outline-none focus:border-accent-blue focus:shadow-glow font-mono transition-all"
              />
              <button
                onClick={() => setShow((s) => ({ ...s, [f.id]: !s[f.id] }))}
                className="px-2 py-2 bg-bg-tertiary border border-bg-border rounded-md text-text-muted hover:text-text-primary transition-colors"
              >
                {show[f.id] ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
            <p className="text-text-muted text-xs">{f.hint}</p>
          </div>
        ))}
      </div>
      <button
        onClick={save}
        className="flex items-center gap-2 px-4 py-2 bg-accent-blue hover:bg-orange-600 text-black text-xs font-semibold rounded-md transition-all hover:shadow-glow"
      >
        <Save size={12} />
        SAVE KEYS
      </button>
    </SectionBox>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const { user, logout, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [invoices, setInvoices] = useState<{ id: string; date: string; amount_eur: number; status: string }[]>([]);

  const currentPlan = (user?.subscription?.plan ?? "free") as PlanId;

  useEffect(() => {
    if (activeTab === "billing") {
      get<{ invoices: typeof invoices }>("/billing/invoices")
        .then((d) => setInvoices(d.invoices))
        .catch(() => {});
    }
  }, [activeTab]);

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  const handlePlanSelect = async (planId: PlanId) => {
    if (planId === currentPlan || planId === "free") {
      toast("Contact support to downgrade.");
      return;
    }
    try {
      const { url } = await post<{ url: string }>("/billing/checkout-session", { plan_id: planId });
      window.location.href = url;
    } catch {
      toast.error("Stripe not configured. Set STRIPE_SECRET_KEY in backend .env.");
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

  return (
    <ErrorBoundary>
      <div className="space-y-5 fade-in max-w-5xl">
        <div className="flex items-center justify-between">
          <h1 className="text-text-primary text-sm font-semibold tracking-widest uppercase">
            Account
          </h1>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent-red transition-colors"
          >
            <LogOut size={13} />
            SIGN OUT
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-bg-border">
          {(["overview", "billing", "security"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={cn(
                "pb-2.5 text-xs tracking-widest uppercase transition-colors border-b-2 -mb-px",
                activeTab === t
                  ? "text-accent-blue border-accent-blue"
                  : "text-text-secondary border-transparent hover:text-text-primary"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* OVERVIEW */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-3 gap-5">
            <div className="col-span-1 space-y-4">
              <SectionBox>
                <Label>PROFILE</Label>
                <div className="flex items-center gap-3 py-2">
                  <div className="w-10 h-10 rounded-full bg-bg-tertiary border border-bg-border flex items-center justify-center">
                    <UserCircle size={22} className="text-text-secondary" />
                  </div>
                  <div>
                    <div className="text-text-primary text-xs font-medium truncate max-w-[140px]">
                      {user?.email ?? "--"}
                    </div>
                    <div className="text-text-muted text-xs mt-0.5">
                      Since {user?.created_at ? new Date(user.created_at).toLocaleDateString("en-GB") : "--"}
                    </div>
                  </div>
                </div>
                <div className="flex justify-between text-xs pt-1 border-t border-bg-border">
                  <span className="text-text-muted">PLAN</span>
                  <span className={cn("font-medium uppercase", {
                    "text-text-muted": currentPlan === "free",
                    "text-accent-blue": currentPlan === "pro",
                    "text-accent-green": currentPlan === "institutional",
                  })}>
                    {currentPlan}
                  </span>
                </div>
                {user?.subscription?.current_period_end && (
                  <div className="flex justify-between text-xs border-t border-bg-border pt-1">
                    <span className="text-text-muted">RENEWS</span>
                    <span className="text-text-secondary">
                      {new Date(user.subscription.current_period_end).toLocaleDateString("en-GB")}
                    </span>
                  </div>
                )}
              </SectionBox>

              <ApiKeysSection />
            </div>

            <div className="col-span-2">
              <Label>SUBSCRIPTION PLANS</Label>
              <div className="grid grid-cols-3 gap-4">
                {PLANS.map((plan) => (
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
        )}

        {/* BILLING */}
        {activeTab === "billing" && (
          <div className="space-y-5">
            <SectionBox>
              <Label>PAYMENT METHOD</Label>
              <div className="flex items-center gap-3 py-2">
                <div className="w-10 h-7 bg-bg-tertiary border border-bg-border rounded flex items-center justify-center">
                  <CreditCard size={16} className="text-text-secondary" />
                </div>
                <div className="text-text-muted text-xs">
                  {currentPlan === "free"
                    ? "No payment method on file."
                    : "Managed via Stripe."}
                </div>
              </div>
              <button
                onClick={handlePortal}
                className="flex items-center gap-1.5 text-xs text-accent-blue hover:text-orange-600 transition-colors"
              >
                <ExternalLink size={11} />
                MANAGE IN STRIPE PORTAL
              </button>
            </SectionBox>

            <SectionBox>
              <Label>INVOICE HISTORY</Label>
              {invoices.length === 0 ? (
                <div className="py-6 text-center text-text-muted text-xs">
                  No invoices found.
                </div>
              ) : (
                <div className="space-y-2">
                  {invoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between text-xs py-2 border-b border-bg-border last:border-0"
                    >
                      <span className="text-text-muted">{inv.date}</span>
                      <span className="text-text-primary">€{inv.amount_eur.toFixed(2)}</span>
                      <span className={cn("uppercase", inv.status === "paid" ? "text-accent-green" : "text-accent-orange")}>
                        {inv.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SectionBox>

            <div className="bg-bg-tertiary border border-bg-border rounded-md p-4 flex items-start gap-3">
              <AlertCircle size={14} className="text-accent-orange mt-0.5 shrink-0" />
              <p className="text-text-secondary text-xs leading-relaxed">
                For refunds or billing issues contact{" "}
                <span className="text-text-primary">billing@capitalis.io</span>.
              </p>
            </div>
          </div>
        )}

        {/* SECURITY */}
        {activeTab === "security" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-5">
              <SectionBox>
                <Label>PASSWORD</Label>
                <ChangePasswordForm />
              </SectionBox>

              <SectionBox>
                <Label>TWO-FACTOR AUTHENTICATION</Label>
                <div className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-text-primary text-xs">TOTP Authenticator</div>
                    <div className="text-text-muted text-xs mt-0.5">
                      Google Authenticator, Authy, 1Password
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-text-muted">
                    <AlertCircle size={12} className="text-accent-orange" />
                    NOT ENABLED
                  </div>
                </div>
                <button
                  onClick={() => toast("2FA coming in next release.")}
                  className="w-full py-2 border border-bg-border rounded-md text-text-secondary hover:border-accent-blue hover:text-text-primary text-xs transition-all"
                >
                  ENABLE 2FA
                </button>
              </SectionBox>
            </div>

            <SectionBox>
              <Label>API KEYS</Label>
              <div className="flex items-center gap-3 py-2">
                <Key size={13} className="text-text-muted" />
                <div className="text-text-muted text-xs">
                  Programmatic API key generation coming in next release.
                </div>
              </div>
            </SectionBox>

            <div className="border border-accent-red/30 bg-red-900/10 rounded-md p-4 space-y-3">
              <div className="text-accent-red text-xs font-medium uppercase tracking-widest flex items-center gap-2">
                <Shield size={13} />
                DANGER ZONE
              </div>
              <p className="text-text-secondary text-xs">
                Permanently delete your account and all associated data. Cannot be undone.
              </p>
              <button
                onClick={() => toast.error("Account deletion requires email confirmation. Contact support.")}
                className="text-xs px-4 py-2 border border-accent-red/50 text-accent-red hover:bg-red-900/20 rounded-md transition-colors"
              >
                DELETE ACCOUNT
              </button>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) { toast.error("Passwords do not match."); return; }
    if (next.length < 8) { toast.error("Minimum 8 characters."); return; }
    setLoading(true);
    try {
      await post("/auth/change-password", { current_password: current, new_password: next });
      toast.success("Password updated.");
      setCurrent(""); setNext(""); setConfirm("");
    } catch {
      toast.error("Password change failed. Check current password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <input
        type="password"
        placeholder="Current password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        className="w-full bg-bg-tertiary border border-bg-border rounded-md text-text-primary text-xs px-3 py-2 focus:outline-none focus:border-accent-blue focus:shadow-glow transition-all"
        required
      />
      <input
        type="password"
        placeholder="New password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        className="w-full bg-bg-tertiary border border-bg-border rounded-md text-text-primary text-xs px-3 py-2 focus:outline-none focus:border-accent-blue focus:shadow-glow transition-all"
        required
      />
      <input
        type="password"
        placeholder="Confirm new password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className="w-full bg-bg-tertiary border border-bg-border rounded-md text-text-primary text-xs px-3 py-2 focus:outline-none focus:border-accent-blue focus:shadow-glow transition-all"
        required
      />
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 bg-accent-blue hover:bg-orange-600 disabled:opacity-50 text-black text-xs font-semibold rounded-md transition-all hover:shadow-glow"
      >
        {loading ? "UPDATING..." : "UPDATE PASSWORD"}
      </button>
    </form>
  );
}
