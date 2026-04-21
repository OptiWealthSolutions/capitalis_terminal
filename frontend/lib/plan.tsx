"use client";

/**
 * Plan limits + gating utilities for the frontend.
 * Source of truth is the backend `/billing/limits` endpoint; this file
 * exposes a React hook + helper components to gate UI consistently.
 */

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth";

export type PlanId = "free" | "pro" | "institutional";

export interface PlanLimits {
  max_portfolios:          number | null;
  optimization_methods:    string[];
  screener_runs_per_day:   number | null;
  pdf_export:              boolean;
  monte_carlo:             boolean;
  ml_alpha:                boolean;
  api_access:              boolean;
  tracker_portfolios:      number | null;
}

const PLAN_ORDER: PlanId[] = ["free", "pro", "institutional"];

/**
 * Local mirror of backend PLAN_LIMITS — used as instant fallback while /me
 * loads. Keep in sync with backend/plan_gate.py.
 */
const LOCAL_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    max_portfolios: 1,
    optimization_methods: ["EqualWeights"],
    screener_runs_per_day: 3,
    pdf_export: false,
    monte_carlo: false,
    ml_alpha: false,
    api_access: false,
    tracker_portfolios: 1,
  },
  pro: {
    max_portfolios: 3,
    optimization_methods: ["EqualWeights", "MeanVar", "MinVol"],
    screener_runs_per_day: null,
    pdf_export: true,
    monte_carlo: true,
    ml_alpha: true,
    api_access: false,
    tracker_portfolios: 3,
  },
  institutional: {
    max_portfolios: null,
    optimization_methods: ["EqualWeights", "MeanVar", "MinVol", "HRP", "Max_Sharpe"],
    screener_runs_per_day: null,
    pdf_export: true,
    monte_carlo: true,
    ml_alpha: true,
    api_access: true,
    tracker_portfolios: null,
  },
};


export function planRank(p: PlanId): number {
  return Math.max(0, PLAN_ORDER.indexOf(p));
}


export function usePlan() {
  const { user } = useAuth();
  const plan = ((user?.subscription?.plan ?? "free") as PlanId);

  // Prefer backend-provided plan_limits if present (AuthUser typed loosely)
  const serverLimits = (user as any)?.plan_limits as PlanLimits | undefined;
  const limits = useMemo<PlanLimits>(() => serverLimits ?? LOCAL_LIMITS[plan], [serverLimits, plan]);

  const canUseMethod  = (m: string) => limits.optimization_methods.includes(m);
  const canAddPortfolio = (currentCount: number) =>
    limits.max_portfolios === null || currentCount < limits.max_portfolios;
  const has = (feature: keyof PlanLimits): boolean => {
    const v = limits[feature];
    return typeof v === "boolean" ? v : v !== null;
  };
  const isAtLeast = (p: PlanId) => planRank(plan) >= planRank(p);

  return { plan, limits, canUseMethod, canAddPortfolio, has, isAtLeast };
}
