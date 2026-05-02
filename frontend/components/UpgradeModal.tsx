"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Check, Lock, Sparkles, X, Zap } from "lucide-react";
import toast from "react-hot-toast";
import { errMsg, post } from "@/lib/api";
import { onUpgradeRequired, type UpgradeReason } from "@/lib/upgradeModal";

type PlanId = "pro" | "premium";
type Interval = "month" | "year";

const PLAN_INFO: Record<PlanId, {
  name: string; color: string; icon: React.ReactNode;
  monthly: string; annualMonthly: string; annualTotal: string;
  features: string[];
}> = {
  pro: {
    name: "Pro", color: "var(--orange)", icon: <Zap size={16} />,
    monthly: "€6.99", annualMonthly: "€5.83", annualTotal: "€69.90",
    features: [
      "5 portfolios + tracker illimité",
      "Tous les optimiseurs (HRP, MeanVar, MinVol)",
      "Screener illimité + scorer",
      "Monte Carlo + VaR / CVaR",
      "Reports PDF avec graphiques",
    ],
  },
  premium: {
    name: "Premium", color: "#A97CC0", icon: <Building2 size={16} />,
    monthly: "€19.99", annualMonthly: "€16.66", annualTotal: "€199.90",
    features: [
      "Portfolios illimités",
      "Max Sharpe optimizer",
      "ML Alpha signals (BUY/HOLD/SELL)",
      "Predictions + backtesting",
      "Alertes illimitées",
      "Support prioritaire (24h SLA)",
    ],
  },
};

export default function UpgradeModal() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<UpgradeReason>({});
  const [plan, setPlan] = useState<PlanId>("pro");
  const [interval, setInterval] = useState<Interval>("year");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => onUpgradeRequired((r) => {
    setReason(r);
    if (r.suggestedPlan) setPlan(r.suggestedPlan);
    setOpen(true);
  }), []);

  const close = useCallback(() => {
    setOpen(false);
    setReason({});
  }, []);

  const handleUpgrade = useCallback(async () => {
    setLoading(true);
    try {
      const { url } = await post<{ url: string }>("/billing/checkout-session", {
        plan_id: plan,
        billing_interval: interval,
      });
      if (url) {
        window.location.href = url;
      } else {
        toast.error("Échec de la création du checkout.");
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      console.error("[upgrade]", err);
      toast.error(errMsg(err?.response?.data?.detail ?? err?.message));
      router.push("/account");
      close();
    } finally {
      setLoading(false);
    }
  }, [plan, interval, router, close]);

  if (!open) return null;

  const info = PLAN_INFO[plan];
  const altPlan: PlanId = plan === "pro" ? "premium" : "pro";
  const altInfo = PLAN_INFO[altPlan];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Passer à un plan supérieur"
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl overflow-hidden"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
        }}
      >
        <Header reason={reason} onClose={close} />

        <div className="p-6">
          <div className="grid grid-cols-2 gap-3 mb-5">
            <PlanTile
              info={PLAN_INFO.pro} planId="pro" selected={plan === "pro"}
              onSelect={() => setPlan("pro")}
            />
            <PlanTile
              info={PLAN_INFO.premium} planId="premium" selected={plan === "premium"}
              onSelect={() => setPlan("premium")}
            />
          </div>

          <IntervalToggle value={interval} onChange={setInterval} info={info} />

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2 mb-5 mt-5">
            {info.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-xs" style={{ color: "var(--t2)" }}>
                <Check size={12} className="mt-0.5 flex-shrink-0" style={{ color: info.color }} />
                {f}
              </li>
            ))}
          </ul>

          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all disabled:opacity-50"
            style={{
              padding: "13px 22px",
              fontSize: 14,
              background: info.color,
              color: "#fff",
            }}
          >
            <Sparkles size={16} />
            {loading ? "Préparation du checkout..." : `Essai 7 jours gratuits — ${info.name}`}
            <ArrowRight size={14} />
          </button>
          <p className="text-xs text-center mt-2" style={{ color: "var(--t3)" }}>
            Sans carte bancaire. Annulable à tout moment depuis Compte → Billing.
          </p>

          <div className="mt-4 text-center text-xs" style={{ color: "var(--t3)" }}>
            Pas convaincu ? <button onClick={close} className="underline">Continuer en Free</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Header({ reason, onClose }: { reason: UpgradeReason; onClose: () => void }) {
  return (
    <div
      className="px-6 py-5 border-b"
      style={{ borderColor: "var(--border)", background: "var(--bg-inner)" }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="flex items-center justify-center rounded-xl flex-shrink-0"
            style={{
              width: 40, height: 40,
              background: "var(--orange-dim)",
              color: "var(--orange)",
              border: "1px solid var(--orange-border)",
            }}
          >
            <Lock size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold" style={{ color: "var(--t1)" }}>
              {reason.title ?? "Passez à un plan supérieur"}
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--t3)", lineHeight: 1.5 }}>
              {reason.message ?? "Cette fonctionnalité est réservée aux abonnés."}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="rounded-lg p-1.5 flex-shrink-0"
          style={{ color: "var(--t3)" }}
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

function PlanTile({
  info, planId, selected, onSelect,
}: {
  info: typeof PLAN_INFO[PlanId];
  planId: PlanId;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="rounded-xl text-left transition-all"
      style={{
        padding: "14px 16px",
        background: selected ? `${info.color}10` : "var(--bg-inner)",
        border: `1px solid ${selected ? info.color : "var(--border)"}`,
        boxShadow: selected ? `0 0 0 1px ${info.color}` : "none",
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span style={{ color: info.color }}>{info.icon}</span>
        <span className="text-sm font-semibold" style={{ color: "var(--t1)" }}>
          {info.name}
        </span>
      </div>
      <div className="text-xs" style={{ color: "var(--t3)" }}>
        À partir de <strong style={{ color: "var(--t1)" }}>{info.annualMonthly}</strong>/mois
      </div>
    </button>
  );
}

function IntervalToggle({
  value, onChange, info,
}: { value: Interval; onChange: (v: Interval) => void; info: typeof PLAN_INFO[PlanId] }) {
  return (
    <div
      className="flex items-center rounded-lg overflow-hidden"
      style={{ border: "1px solid var(--border)", background: "var(--bg-inner)" }}
    >
      <button
        type="button"
        onClick={() => onChange("month")}
        className="flex-1 text-xs py-2.5 font-medium transition-colors"
        style={{
          background: value === "month" ? "var(--bg-pop)" : "transparent",
          color: value === "month" ? "var(--t1)" : "var(--t3)",
        }}
      >
        Mensuel · {info.monthly}/mo
      </button>
      <button
        type="button"
        onClick={() => onChange("year")}
        className="flex-1 text-xs py-2.5 font-medium transition-colors flex items-center justify-center gap-1.5"
        style={{
          background: value === "year" ? "var(--bg-pop)" : "transparent",
          color: value === "year" ? "var(--t1)" : "var(--t3)",
        }}
      >
        Annuel · {info.annualMonthly}/mo
        <span
          className="text-xs px-1.5 py-0.5 rounded font-semibold"
          style={{ background: "rgba(34,197,94,0.15)", color: "#22C55E", fontSize: 9 }}
        >
          2 MOIS OFFERTS
        </span>
      </button>
    </div>
  );
}
