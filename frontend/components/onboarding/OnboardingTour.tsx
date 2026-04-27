"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard, Filter, Star, Network, Briefcase, Wallet,
  TrendingUp, FileText, Users, Sparkles, X, ArrowRight, ArrowLeft,
} from "lucide-react";

const STORAGE_KEY = "capitalis_tour_seen_v1";

interface Step {
  icon: React.ReactNode;
  titleKey: keyof ReturnType<typeof useI18n>["t"]["tour"];
  bodyKey:  keyof ReturnType<typeof useI18n>["t"]["tour"];
}

const STEPS: Step[] = [
  { icon: <Sparkles size={20} />,        titleKey: "welcome",    bodyKey: "welcomeBody"   },
  { icon: <LayoutDashboard size={20} />, titleKey: "dashboard",  bodyKey: "dashboardBody" },
  { icon: <Filter size={20} />,          titleKey: "screener",   bodyKey: "screenerBody"  },
  { icon: <Star size={20} />,            titleKey: "scorer",     bodyKey: "scorerBody"    },
  { icon: <Network size={20} />,         titleKey: "marketMap",  bodyKey: "marketMapBody" },
  { icon: <Briefcase size={20} />,       titleKey: "portfolio",  bodyKey: "portfolioBody" },
  { icon: <Wallet size={20} />,          titleKey: "tracker",    bodyKey: "trackerBody"   },
  { icon: <TrendingUp size={20} />,      titleKey: "equity",     bodyKey: "equityBody"    },
  { icon: <FileText size={20} />,        titleKey: "reporting",  bodyKey: "reportingBody" },
  { icon: <Users size={20} />,           titleKey: "community",  bodyKey: "communityBody" },
  { icon: <Sparkles size={20} />,        titleKey: "ready",      bodyKey: "readyBody"     },
];

export default function OnboardingTour() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [open, setOpen]   = useState(false);
  const [step, setStep]   = useState(0);
  const [dontShow, setDontShow] = useState(true);

  // Show on first authed visit only
  useEffect(() => {
    if (!user) return;
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (seen !== "1") setOpen(true);
    } catch { /* ignore */ }
  }, [user]);

  function close(persist: boolean) {
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    }
    setOpen(false);
  }

  if (!open) return null;

  const s = STEPS[step];
  const isLast  = step === STEPS.length - 1;
  const isFirst = step === 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.62)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, animation: "fadeUp 0.2s ease-out",
      }}
      onClick={() => close(dontShow)}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520,
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderTopColor: "var(--border-hi)",
          borderRadius: "var(--r-2xl)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
      >
        {/* Top bar with progress + close */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", gap: 4, flex: 1 }}>
            {STEPS.map((_, i) => (
              <div key={i} style={{
                flex: 1, height: 3, borderRadius: 999,
                background: i <= step ? "var(--orange)" : "var(--border)",
                transition: "background 0.25s",
              }} />
            ))}
          </div>
          <button
            onClick={() => close(dontShow)}
            aria-label="Close tour"
            style={{
              width: 26, height: 26, borderRadius: 999,
              background: "transparent", border: "1px solid var(--border)",
              color: "var(--t3)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={13} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "32px 28px 24px", textAlign: "center" }}>
          <div style={{
            width: 56, height: 56, margin: "0 auto 16px",
            borderRadius: 14,
            background: "var(--orange-dim)",
            border: "1px solid var(--orange-border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--orange)",
          }}>
            {s.icon}
          </div>
          <h2 style={{
            fontSize: "1.25rem", fontWeight: 600, color: "var(--t1)", marginBottom: 8,
            letterSpacing: "-0.01em",
          }}>
            {t.tour[s.titleKey]}
          </h2>
          <p style={{
            fontSize: "0.86rem", color: "var(--t2)", lineHeight: 1.55,
            maxWidth: 420, margin: "0 auto",
          }}>
            {t.tour[s.bodyKey]}
          </p>
          <p style={{ marginTop: 14, fontSize: "0.65rem", color: "var(--t3)", letterSpacing: "0.06em" }}>
            {step + 1} / {STEPS.length}
          </p>
        </div>

        {/* Footer actions */}
        <div style={{
          padding: "14px 18px",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-surface)",
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        }}>
          {/* Don't show again */}
          <label style={{
            display: "flex", alignItems: "center", gap: 7,
            fontSize: "0.72rem", color: "var(--t2)", cursor: "pointer",
            userSelect: "none",
          }}>
            <input
              type="checkbox"
              checked={dontShow}
              onChange={e => setDontShow(e.target.checked)}
              style={{ accentColor: "var(--orange)", width: 14, height: 14 }}
            />
            {t.tour.dontShow}
          </label>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {!isFirst && (
              <button
                onClick={() => setStep(s => Math.max(0, s - 1))}
                className="btn-secondary"
                style={{ borderRadius: "var(--r-sm)" }}
              >
                <ArrowLeft size={12} /> {t.common.previous}
              </button>
            )}
            {!isLast ? (
              <>
                <button
                  onClick={() => close(dontShow)}
                  className="btn-ghost"
                  style={{ fontSize: "0.74rem" }}
                >
                  {t.tour.skipTour}
                </button>
                <button
                  onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}
                  className="btn-primary"
                  style={{ borderRadius: "var(--r-sm)" }}
                >
                  {t.common.next} <ArrowRight size={12} />
                </button>
              </>
            ) : (
              <button
                onClick={() => close(dontShow)}
                className="btn-primary"
                style={{ borderRadius: "var(--r-sm)" }}
              >
                {t.common.finish}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
