"use client";

import { useState } from "react";
import { Sparkles, TrendingUp, Shield, Zap, Clock, BarChart2, Target, ChevronRight, Check, X } from "lucide-react";
import { useInvestorMode, type InvestorProfile } from "@/lib/investorMode";
import { getRecommendations } from "@/lib/investorMode";

// ─── Step data ────────────────────────────────────────────────────────────────

interface Choice<T> { value: T; label: string; sublabel: string; icon: React.ReactNode }

const EXPERIENCE_CHOICES: Choice<InvestorProfile["experience"]>[] = [
  { value: "beginner",     label: "Beginner",     sublabel: "New to investing, learning the basics",              icon: <Sparkles size={20} /> },
  { value: "intermediate", label: "Intermediate", sublabel: "Some experience with stocks and portfolios",          icon: <TrendingUp size={20} /> },
  { value: "advanced",     label: "Expert",       sublabel: "Comfortable with quant finance and complex analysis", icon: <BarChart2 size={20} /> },
];

const HORIZON_CHOICES: Choice<InvestorProfile["horizon"]>[] = [
  { value: "short",  label: "Short-term",   sublabel: "Less than 2 years",   icon: <Clock size={20} /> },
  { value: "medium", label: "Medium-term",  sublabel: "2 to 10 years",       icon: <Target size={20} /> },
  { value: "long",   label: "Long-term",    sublabel: "More than 10 years",  icon: <TrendingUp size={20} /> },
];

const RISK_CHOICES: Choice<InvestorProfile["risk"]>[] = [
  { value: "conservative", label: "Conservative", sublabel: "Capital preservation, low volatility",       icon: <Shield size={20} /> },
  { value: "balanced",     label: "Balanced",     sublabel: "Mix of growth and safety",                   icon: <BarChart2 size={20} /> },
  { value: "aggressive",   label: "Aggressive",   sublabel: "Maximum growth, comfortable with drawdowns", icon: <Zap size={20} /> },
];

const CAPITAL_CHOICES: Choice<InvestorProfile["capital"]>[] = [
  { value: "small",       label: "Under €10k",      sublabel: "Getting started",           icon: <span style={{ fontSize: 18 }}>💼</span> },
  { value: "medium",      label: "€10k – €100k",    sublabel: "Active investor",           icon: <span style={{ fontSize: 18 }}>📊</span> },
  { value: "large",       label: "Over €100k",      sublabel: "Significant portfolio",     icon: <span style={{ fontSize: 18 }}>🏦</span> },
  { value: "undisclosed", label: "Prefer not to say", sublabel: "Skip this question",       icon: <span style={{ fontSize: 18 }}>🔒</span> },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STRATEGY_LABELS: Record<string, string> = {
  income: "Income",
  quality_growth: "Quality Growth",
  growth_momentum: "Growth Momentum",
  wide_moat: "Wide Moat",
  conservative: "Conservative",
  balanced: "Balanced",
  growth: "Growth",
  MinVol: "Min Volatility",
  HRP: "Hierarchical Risk Parity",
  MeanVar: "Mean-Variance",
};

function label(key: string) { return STRATEGY_LABELS[key] ?? key; }

// ─── Card component ───────────────────────────────────────────────────────────

function ChoiceCard<T extends string>({
  choice, selected, onSelect,
}: { choice: Choice<T>; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-start gap-4 rounded-xl border text-left transition-all"
      style={{
        padding: "14px 16px",
        background: selected ? "rgba(249,115,22,0.08)" : "var(--surface)",
        borderColor: selected ? "var(--orange)" : "var(--border)",
        boxShadow: selected ? "0 0 0 1px var(--orange)" : "none",
      }}
    >
      <span
        className="flex-shrink-0 flex items-center justify-center rounded-lg"
        style={{
          width: 40, height: 40,
          background: selected ? "var(--orange-dim)" : "var(--bg-hover)",
          color: selected ? "var(--orange)" : "var(--t3)",
        }}
      >
        {choice.icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold" style={{ color: "var(--t1)", }}>
          {choice.label}
        </span>
        <span className="block text-xs mt-0.5" style={{ color: "var(--t3)" }}>
          {choice.sublabel}
        </span>
      </span>
      {selected && (
        <span
          className="flex-shrink-0 flex items-center justify-center rounded-full"
          style={{ width: 20, height: 20, background: "var(--orange)", color: "#fff", marginTop: 2 }}
        >
          <Check size={12} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

// ─── Step dots ───────────────────────────────────────────────────────────────

function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-1.5 justify-center">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          style={{
            width: i === current ? 18 : 6,
            height: 6,
            borderRadius: 3,
            background: i < current ? "var(--orange)" : i === current ? "var(--orange)" : "var(--border)",
            opacity: i < current ? 0.5 : 1,
            transition: "all 0.25s ease",
          }}
        />
      ))}
    </div>
  );
}

// ─── Result pill ─────────────────────────────────────────────────────────────

function Pill({ label: text, color = "var(--orange)" }: { label: string; color?: string }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: `${color}18`, color, letterSpacing: "0.04em" }}
    >
      {text}
    </span>
  );
}

// ─── Main modal ──────────────────────────────────────────────────────────────

export default function InvestorProfileModal() {
  const { closeProfileModal, setProfile, setMode } = useInvestorMode();

  const [step, setStep]                     = useState(0);
  const [experience, setExperience]         = useState<InvestorProfile["experience"] | null>(null);
  const [horizon, setHorizon]               = useState<InvestorProfile["horizon"] | null>(null);
  const [risk, setRisk]                     = useState<InvestorProfile["risk"] | null>(null);
  const [capital, setCapital]               = useState<InvestorProfile["capital"] | null>(null);

  const TOTAL_STEPS = 5; // 0=welcome, 1=exp, 2=horizon, 3=risk, 4=capital, 5=result = step 5

  function next() { setStep(s => s + 1); }
  function back() { setStep(s => s - 1); }

  function finish() {
    if (!experience || !horizon || !risk || !capital) return;
    const profile: InvestorProfile = { experience, horizon, risk, capital, completedAt: new Date().toISOString() };
    setProfile(profile);
    setMode("simple");
    closeProfileModal();
  }

  function skipToAdvanced() {
    sessionStorage.setItem("capitalis_profile_modal_dismissed", "1");
    closeProfileModal();
  }

  function neverShow() {
    localStorage.setItem("capitalis_profile_modal_never", "1");
    localStorage.setItem("capitalis_onboarded", "1");
    sessionStorage.setItem("capitalis_profile_modal_dismissed", "1");
    closeProfileModal();
  }

  const canProceedStep: Record<number, boolean> = {
    0: true,
    1: experience !== null,
    2: horizon !== null,
    3: risk !== null,
    4: capital !== null,
  };

  const resultProfile = experience && horizon && risk && capital
    ? getRecommendations({ experience, horizon, risk, capital, completedAt: "" })
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="w-full max-w-[500px] rounded-2xl overflow-hidden"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}
      >
        {/* Header bar */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-hover)" }}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={14} style={{ color: "var(--orange)" }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.10em", color: "var(--t3)", }}>
              INVESTOR PROFILE
            </span>
          </div>
          <button onClick={skipToAdvanced} style={{ color: "var(--t3)" }} className="hover:opacity-70 transition-opacity">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6 flex flex-col gap-5" style={{ minHeight: 380 }}>

          {/* ── Step 0: Welcome ─────────────────────────────────────── */}
          {step === 0 && (
            <>
              <div className="text-center flex flex-col items-center gap-3 pt-2">
                <div
                  className="flex items-center justify-center rounded-2xl"
                  style={{ width: 64, height: 64, background: "var(--orange-dim)" }}
                >
                  <Sparkles size={28} style={{ color: "var(--orange)" }} />
                </div>
                <h2 className="text-lg font-bold" style={{ color: "var(--t1)", }}>
                  Personalize Your Experience
                </h2>
                <p className="text-sm max-w-xs mx-auto" style={{ color: "var(--t3)", lineHeight: 1.6 }}>
                  Answer 4 quick questions so we can recommend the right strategies for your profile — screener, scorer, and allocation.
                </p>
              </div>
              <div className="flex flex-col gap-2 mt-2">
                <button onClick={next} className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
                  Get started <ChevronRight size={15} />
                </button>
                <button
                  onClick={skipToAdvanced}
                  className="text-xs text-center py-2 transition-opacity hover:opacity-70"
                  style={{ color: "var(--t3)" }}
                >
                  Skip — go straight to Advanced mode
                </button>
                <button
                  onClick={neverShow}
                  className="text-xs text-center py-1 transition-opacity hover:opacity-70"
                  style={{ color: "var(--t3)", opacity: 0.55 }}
                >
                  Ne plus afficher
                </button>
              </div>
            </>
          )}

          {/* ── Step 1: Experience ──────────────────────────────────── */}
          {step === 1 && (
            <>
              <div>
                <h3 className="text-sm font-bold mb-1" style={{ color: "var(--t1)", }}>
                  What's your investing experience?
                </h3>
                <p className="text-xs" style={{ color: "var(--t3)" }}>This helps us calibrate the complexity of tools shown to you.</p>
              </div>
              <div className="flex flex-col gap-2">
                {EXPERIENCE_CHOICES.map(c => (
                  <ChoiceCard key={c.value} choice={c} selected={experience === c.value} onSelect={() => setExperience(c.value)} />
                ))}
              </div>
            </>
          )}

          {/* ── Step 2: Horizon ─────────────────────────────────────── */}
          {step === 2 && (
            <>
              <div>
                <h3 className="text-sm font-bold mb-1" style={{ color: "var(--t1)", }}>
                  What's your investment horizon?
                </h3>
                <p className="text-xs" style={{ color: "var(--t3)" }}>Affects which strategies and time-frames are recommended.</p>
              </div>
              <div className="flex flex-col gap-2">
                {HORIZON_CHOICES.map(c => (
                  <ChoiceCard key={c.value} choice={c} selected={horizon === c.value} onSelect={() => setHorizon(c.value)} />
                ))}
              </div>
            </>
          )}

          {/* ── Step 3: Risk ────────────────────────────────────────── */}
          {step === 3 && (
            <>
              <div>
                <h3 className="text-sm font-bold mb-1" style={{ color: "var(--t1)", }}>
                  What's your risk tolerance?
                </h3>
                <p className="text-xs" style={{ color: "var(--t3)" }}>How comfortable are you with portfolio drawdowns?</p>
              </div>
              <div className="flex flex-col gap-2">
                {RISK_CHOICES.map(c => (
                  <ChoiceCard key={c.value} choice={c} selected={risk === c.value} onSelect={() => setRisk(c.value)} />
                ))}
              </div>
            </>
          )}

          {/* ── Step 4: Capital ─────────────────────────────────────── */}
          {step === 4 && (
            <>
              <div>
                <h3 className="text-sm font-bold mb-1" style={{ color: "var(--t1)", }}>
                  What's your approximate capital?
                </h3>
                <p className="text-xs" style={{ color: "var(--t3)" }}>Used only for sizing suggestions. Never shared.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {CAPITAL_CHOICES.map(c => (
                  <ChoiceCard key={c.value} choice={c} selected={capital === c.value} onSelect={() => setCapital(c.value)} />
                ))}
              </div>
            </>
          )}

          {/* ── Step 5: Result ──────────────────────────────────────── */}
          {step === 5 && resultProfile && (
            <>
              <div className="text-center flex flex-col items-center gap-2 pt-1">
                <div
                  className="flex items-center justify-center rounded-2xl"
                  style={{ width: 52, height: 52, background: "rgba(34,197,94,0.12)" }}
                >
                  <Check size={24} style={{ color: "var(--green)" }} />
                </div>
                <h3 className="text-sm font-bold" style={{ color: "var(--t1)", }}>
                  Your Profile is Ready
                </h3>
                <p className="text-xs max-w-xs" style={{ color: "var(--t3)" }}>{resultProfile.description}</p>
              </div>

              <div
                className="rounded-xl p-4 flex flex-col gap-3"
                style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}
              >
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--t3)" }}>
                  Recommended for you
                </span>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: "var(--t3)" }}>Screener strategy</span>
                    <Pill label={label(resultProfile.screenerPreset)} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: "var(--t3)" }}>Scorer strategy</span>
                    <Pill label={label(resultProfile.scorerPreset)} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: "var(--t3)" }}>Allocation method</span>
                    <Pill label={label(resultProfile.allocationMethod)} color="var(--blue, #60A5FA)" />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button onClick={finish} className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
                  Start Exploring <ChevronRight size={15} />
                </button>
                <button
                  onClick={() => { finish(); }}
                  className="text-xs text-center py-1.5 transition-opacity hover:opacity-70"
                  style={{ color: "var(--t3)" }}
                >
                  You can switch to Advanced mode anytime from the header
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer: step dots + nav */}
        {step > 0 && step < 5 && (
          <div
            className="px-6 py-4 flex items-center justify-between"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <button
              onClick={back}
              className="text-xs transition-opacity hover:opacity-70"
              style={{ color: "var(--t3)" }}
            >
              ← Back
            </button>
            <StepDots total={4} current={step - 1} />
            <button
              onClick={step === 4 ? next : next}
              disabled={!canProceedStep[step]}
              className="text-xs font-semibold transition-all"
              style={{
                color: canProceedStep[step] ? "var(--orange)" : "var(--t3)",
                opacity: canProceedStep[step] ? 1 : 0.4,
                cursor: canProceedStep[step] ? "pointer" : "not-allowed",
              }}
            >
              {step === 4 ? "See results →" : "Next →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
