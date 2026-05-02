"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { LoadingSpinner, SkeletonBlock } from "@/components/ui/LoadingSpinner";
import { QueryError } from "@/components/ui/ErrorBoundary";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Play, RefreshCw, AlertTriangle, CheckCircle, XCircle, Info } from "lucide-react";
import toast from "react-hot-toast";
import { useI18n } from "@/lib/i18n";

interface ModelStatus {
  primary_model: { path: string; exists: boolean };
  meta_model: { path: string; exists: boolean };
  loaded: string[];
}

interface InferenceEntry {
  ticker: string;
  prediction?: string;
  confidence?: number;
  probabilities?: Record<string, number>;
  error?: string;
}

const SIGNAL_COLOR: Record<string, string> = {
  BUY:  "var(--green)",
  HOLD: "var(--yellow)",
  SELL: "var(--red)",
};

export default function PredictionsPage() {
  const { t } = useI18n();
  const [tickerInput, setTickerInput] = useState("NVDA,MSFT,GOOG");
  const [inferenceResults, setInferenceResults] = useState<InferenceEntry[]>([]);

  const status = useQuery<ModelStatus>({
    queryKey: ["ml-status"],
    queryFn: () => get("/predictions/status"),
    staleTime: 60_000,
  });

  const reload = useMutation({
    mutationFn: () => post("/predictions/reload"),
    onSuccess: () => { toast.success("Models reloaded."); status.refetch(); },
    onError: () => toast.error("Model reload failed."),
  });

  const infer = useMutation({
    mutationFn: () => {
      const tickers = tickerInput.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
      return post<{ results: InferenceEntry[] }>("/predictions/infer", { tickers });
    },
    onSuccess: (data) => {
      setInferenceResults(data.results);
      toast.success("Inference complete.");
    },
    onError: () => toast.error("Inference failed."),
  });

  const modelsLoaded = (status.data?.loaded.length ?? 0) > 0;

  return (
    <ErrorBoundary>
      <div className="p-4 sm:p-6 xl:px-8 max-w-[2000px] mx-auto fade-in">

        {/* Header */}
        <div className="mb-6">
          <p style={{ fontSize: "0.68rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 4 }}>
            {t.predictions.breadcrumb}
          </p>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--t1)" }}>{t.predictions.pageTitle}</h1>
          <p style={{ color: "var(--t2)", fontSize: "0.82rem", marginTop: 4 }}>
            {t.predictions.subtitle}
          </p>
        </div>

        {/* How it works */}
        <div className="mb-5 rounded p-4 text-xs" style={{ background: "var(--orange-dim)", border: "1px solid var(--orange-border)", color: "var(--t2)" }}>
          <div className="flex items-start gap-2">
            <Info size={13} style={{ color: "var(--orange)", flexShrink: 0, marginTop: 1 }} />
            <div style={{ lineHeight: 1.6 }}>
              <strong style={{ color: "var(--orange)" }}>How it works:</strong>{" "}
              An ML ensemble (XGBoost + LightGBM) trained on 50+ fundamental and technical factors outputs a{" "}
              <span style={{ color: "var(--green)", fontWeight: 600 }}>BUY</span> /{" "}
              <span style={{ color: "var(--yellow)", fontWeight: 600 }}>HOLD</span> /{" "}
              <span style={{ color: "var(--red)", fontWeight: 600 }}>SELL</span> signal.
              A meta-model (stacking layer) combines predictions to improve robustness.
              <strong style={{ color: "var(--t1)" }}> Confidence</strong> = probability of the predicted class.
              High confidence (&gt; 70%) is more actionable. Models must be trained before inference is available.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left panel */}
          <div className="col-span-1 space-y-4">

            {/* MLOps panel */}
            <div className="card" style={{ padding: "16px 20px" }}>
              <div className="flex items-center justify-between mb-4">
                <span style={{ fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)" }}>
                  MLOps Control
                </span>
                <button
                  onClick={() => reload.mutate()}
                  disabled={reload.isPending}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--t2)", fontSize: "0.68rem",
                    opacity: reload.isPending ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--t1)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--t2)")}
                >
                  {reload.isPending ? <LoadingSpinner size="sm" /> : <RefreshCw size={11} />}
                  RELOAD
                </button>
              </div>

              {status.isLoading ? (
                <div className="space-y-2">
                  <SkeletonBlock className="h-16" />
                  <SkeletonBlock className="h-16" />
                </div>
              ) : status.error ? (
                <QueryError error={status.error as Error} onRetry={() => status.refetch()} />
              ) : status.data ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <ModelCard
                    label="Primary Model"
                    path={status.data.primary_model.path}
                    exists={status.data.primary_model.exists}
                    loaded={status.data.loaded.includes("primary")}
                  />
                  <ModelCard
                    label="Meta Model (Stacking)"
                    path={status.data.meta_model.path}
                    exists={status.data.meta_model.exists}
                    loaded={status.data.loaded.includes("meta")}
                  />
                </div>
              ) : null}
            </div>

            {/* Inference panel */}
            <div className="card" style={{ padding: "16px 20px" }}>
              <span style={{ fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)", display: "block", marginBottom: 12 }}>
                Inference Engine
              </span>

              <input
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value)}
                placeholder="NVDA,MSFT,GOOG"
                className="input-field"
                style={{ width: "100%", marginBottom: 10, fontFamily: "monospace", textTransform: "uppercase" }}
              />

              {!modelsLoaded && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--yellow)", fontSize: "0.72rem", marginBottom: 10 }}>
                  <AlertTriangle size={12} />
                  No models loaded. Train models first.
                </div>
              )}

              <button
                onClick={() => infer.mutate()}
                disabled={infer.isPending || !modelsLoaded}
                className="btn-primary"
                style={{ width: "100%" }}
              >
                {infer.isPending ? <LoadingSpinner size="sm" /> : <Play size={13} />}
                {infer.isPending ? "RUNNING…" : "RUN INFERENCE"}
              </button>
            </div>
          </div>

          {/* Right: Results */}
          <div className="col-span-1 lg:col-span-2">
            {infer.isPending && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 280 }}>
                <LoadingSpinner label="RUNNING INFERENCE…" size="lg" />
              </div>
            )}

            {inferenceResults.length > 0 && !infer.isPending && (
              <div>
                <span style={{ fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)", display: "block", marginBottom: 12 }}>
                  {inferenceResults.length} predictions
                </span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                  {inferenceResults.map((entry) => (
                    <SignalCard key={entry.ticker} entry={entry} />
                  ))}
                </div>
              </div>
            )}

            {inferenceResults.length === 0 && !infer.isPending && (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", height: 320, gap: 14,
                color: "var(--t3)", fontSize: "0.82rem", textAlign: "center",
              }}>
                <div style={{
                  width: 44, height: 44,
                  background: "var(--bg-card)", border: "1px solid var(--border)",
                  borderRadius: "var(--r)", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Play size={16} style={{ color: "var(--t3)" }} />
                </div>
                {modelsLoaded
                  ? "Enter tickers and run inference."
                  : "Train and load ML models to use this feature."}
              </div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}

function ModelCard({ label, path, exists, loaded }: { label: string; path: string; exists: boolean; loaded: boolean }) {
  return (
    <div style={{
      background: "var(--bg-base)", border: "1px solid var(--border)",
      borderRadius: "var(--r-sm)", padding: "10px 12px",
    }}>
      <div style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--t2)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: "0.65rem", color: "var(--t3)", fontFamily: "monospace", marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
           title={path}>
        {path.split("/").slice(-2).join("/")}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <StatusPill ok={exists} label="ON DISK" />
        <StatusPill ok={loaded} label="LOADED" />
      </div>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span style={{
      display: "flex", alignItems: "center", gap: 4,
      fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.05em",
      color: ok ? "var(--green)" : "var(--red)",
    }}>
      {ok ? <CheckCircle size={9} /> : <XCircle size={9} />}
      {ok ? label : `NO ${label}`}
    </span>
  );
}

function SignalCard({ entry }: { entry: InferenceEntry }) {
  const signalColor = SIGNAL_COLOR[entry.prediction ?? ""] ?? "var(--t1)";
  return (
    <div style={{
      background: "var(--bg-card)", border: `1px solid ${entry.error ? "var(--red)" : "var(--border)"}`,
      borderRadius: "var(--r)", padding: "16px 18px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ color: "var(--orange)", fontWeight: 700, fontFamily: "monospace", fontSize: "0.9rem" }}>
          {entry.ticker}
        </span>
        {entry.prediction && (
          <span style={{ color: signalColor, fontWeight: 700, fontSize: "0.85rem", letterSpacing: "0.08em" }}>
            {entry.prediction}
          </span>
        )}
      </div>

      {entry.error ? (
        <div style={{ color: "var(--red)", fontSize: "0.72rem" }}>{entry.error}</div>
      ) : (
        <>
          {entry.confidence !== undefined && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", color: "var(--t3)", marginBottom: 4 }}>
                <span>CONFIDENCE</span>
                <span style={{ color: "var(--t1)", fontWeight: 600 }}>{(entry.confidence * 100).toFixed(1)}%</span>
              </div>
              <div style={{ width: "100%", height: 3, background: "var(--bg-base)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${entry.confidence * 100}%`, height: "100%", background: signalColor, borderRadius: 2, transition: "width 0.4s" }} />
              </div>
            </div>
          )}

          {entry.probabilities && (
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
              {Object.entries(entry.probabilities).map(([label, prob]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", marginBottom: 3 }}>
                  <span style={{ color: SIGNAL_COLOR[label] ?? "var(--t2)", fontWeight: 600 }}>{label}</span>
                  <span style={{ color: "var(--t2)", fontFamily: "monospace" }}>{(prob * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
