/**
 * Tiny event bus for showing the global UpgradeModal from anywhere
 * (axios interceptor, callback, button onClick).
 */

export type UpgradeReason = {
  title?: string;
  message?: string;
  /** Suggested target plan: "pro" or "premium". Modal preselects it. */
  suggestedPlan?: "pro" | "premium";
};

const EVENT = "capitalis:upgrade-required";

export function showUpgradeModal(reason: UpgradeReason = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<UpgradeReason>(EVENT, { detail: reason }));
}

export function onUpgradeRequired(cb: (r: UpgradeReason) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => cb((e as CustomEvent<UpgradeReason>).detail || {});
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
