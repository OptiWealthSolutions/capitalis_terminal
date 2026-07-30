"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type AppMode = "simple" | "advanced";

export interface InvestorProfile {
  experience: "beginner" | "intermediate" | "advanced";
  horizon: "short" | "medium" | "long";
  risk: "conservative" | "balanced" | "aggressive";
  capital: "small" | "medium" | "large" | "undisclosed";
  completedAt: string;
}

export interface Recommendations {
  screenerPreset: string;
  scorerPreset: string;
  allocationMethod: string;
  description: string;
}

export function getRecommendations(profile: InvestorProfile): Recommendations {
  const { risk, horizon } = profile;

  const screenerMap: Record<string, string> = {
    conservative: "income",
    balanced: "quality_growth",
    aggressive: risk === "aggressive" && horizon === "long" ? "growth_momentum" : "wide_moat",
  };

  const scorerMap: Record<string, string> = {
    conservative: "conservative",
    balanced: "balanced",
    aggressive: "growth",
  };

  const methodMap: Record<string, string> = {
    conservative: "MinVol",
    balanced: "HRP",
    aggressive: "HRP",
  };

  const descMap: Record<string, string> = {
    conservative: "Capital preservation & income — low volatility, stable dividends",
    balanced: "Quality growth at a reasonable price — diversified, risk-managed",
    aggressive: "Growth & momentum — higher returns, higher volatility",
  };

  return {
    screenerPreset: screenerMap[risk],
    scorerPreset: scorerMap[risk],
    allocationMethod: methodMap[risk],
    description: descMap[risk],
  };
}

// ─── Simple mode risk → allocation method ────────────────────────────────────
export const SIMPLE_RISK_METHODS: Record<"conservative" | "balanced" | "aggressive", string> = {
  conservative: "MinVol",
  balanced: "HRP",
  aggressive: "MeanVar",
};

// ─── Context ─────────────────────────────────────────────────────────────────
interface InvestorModeCtx {
  mode: AppMode;
  setMode: (m: AppMode) => void;
  toggleMode: () => void;
  profile: InvestorProfile | null;
  setProfile: (p: InvestorProfile | null) => void;
  recommendations: Recommendations | null;
  showProfileModal: boolean;
  openProfileModal: () => void;
  closeProfileModal: () => void;
}

const Ctx = createContext<InvestorModeCtx | null>(null);

const MODE_KEY      = "capitalis_mode";
const PROFILE_KEY   = "capitalis_investor_profile";
const ONBOARDED_KEY = "capitalis_onboarded";

export function InvestorModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState]           = useState<AppMode>("advanced");
  const [profile, setProfileState]     = useState<InvestorProfile | null>(null);
  const [showProfileModal, setShow]    = useState(false);

  useEffect(() => {
    const m = localStorage.getItem(MODE_KEY) as AppMode | null;
    if (m === "simple" || m === "advanced") setModeState(m);
    const p = localStorage.getItem(PROFILE_KEY);
    if (p) {
      try { setProfileState(JSON.parse(p)); } catch {}
    } else {
      // First visit — auto-open profile modal after 1.2s delay
      const neverShow = localStorage.getItem("capitalis_profile_modal_never");
      if (!localStorage.getItem(ONBOARDED_KEY) && !neverShow) {
        const timer = setTimeout(() => setShow(true), 1200);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  function setMode(m: AppMode) {
    setModeState(m);
    localStorage.setItem(MODE_KEY, m);
  }

  function toggleMode() { setMode(mode === "simple" ? "advanced" : "simple"); }

  function setProfile(p: InvestorProfile | null) {
    setProfileState(p);
    if (p) {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
      localStorage.setItem(ONBOARDED_KEY, "1");
    } else {
      localStorage.removeItem(PROFILE_KEY);
    }
  }

  const recommendations = profile ? getRecommendations(profile) : null;

  return (
    <Ctx.Provider value={{
      mode, setMode, toggleMode,
      profile, setProfile,
      recommendations,
      showProfileModal,
      openProfileModal:  () => setShow(true),
      closeProfileModal: () => setShow(false),
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useInvestorMode(): InvestorModeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useInvestorMode must be used inside InvestorModeProvider");
  return ctx;
}
