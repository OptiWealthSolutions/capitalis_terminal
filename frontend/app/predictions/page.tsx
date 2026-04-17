"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { LoadingSpinner, SkeletonBlock } from "@/components/ui/LoadingSpinner";
import { QueryError } from "@/components/ui/ErrorBoundary";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { cn } from "@/lib/utils";
import { Play, RefreshCw, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";

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

export default function PredictionsPage() {
  const [tickerInput, setTickerInput] = useState("NVDA,MSFT,GOOG");
  const [inferenceResults, setInferenceResults] = useState<InferenceEntry[]>([]);

  const status = useQuery<ModelStatus>({
    queryKey: ["ml-status"],
    queryFn: () => get("/predictions/status"),
    staleTime: 60_000,
  });

  const reload = useMutation({
    mutationFn: () => post("/predictions/reload"),
    onSuccess: () => toast.success("Models reloaded from disk."),
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

  const LABEL_COLORS: Record<string, string> = {
    BUY: "text-accent-green",
    HOLD: "text-accent-orange",
    SELL: "text-accent-red",
  };

  return (
    <ErrorBoundary>
      <div className="space-y-5 fade-in">
        <h1 className="text-text-primary text-sm font-semibold tracking-widest uppercase">
          Predictive Alpha — ML Inference
        </h1>

        {/* Model status */}
        <div className="bg-bg-secondary border border-bg-border p-4">
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>MLOPS CONTROL PANEL</SectionLabel>
            <button
              onClick={() => reload.mutate()}
              disabled={reload.isPending}
              className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
            >
              {reload.isPending ? <LoadingSpinner size="sm" /> : <RefreshCw size={11} />}
              RELOAD ARTIFACTS
            </button>
          </div>

          {status.isLoading ? (
            <div className="grid grid-cols-2 gap-3">
              <SkeletonBlock className="h-16" />
              <SkeletonBlock className="h-16" />
            </div>
          ) : status.error ? (
            <QueryError error={status.error as Error} onRetry={() => status.refetch()} />
          ) : status.data ? (
            <div className="grid grid-cols-2 gap-3">
              <ModelCard
                label="PRIMARY MODEL"
                path={status.data.primary_model.path}
                exists={status.data.primary_model.exists}
                loaded={status.data.loaded.includes("primary")}
              />
              <ModelCard
                label="META MODEL (STACKING)"
                path={status.data.meta_model.path}
                exists={status.data.meta_model.exists}
                loaded={status.data.loaded.includes("meta")}
              />
            </div>
          ) : null}
        </div>

        {/* Inference */}
        <div className="bg-bg-secondary border border-bg-border p-4 space-y-3">
          <SectionLabel>INFERENCE ENGINE</SectionLabel>
          <div className="flex gap-2">
            <input
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value)}
              placeholder="NVDA,MSFT,GOOG (comma separated)"
              className="flex-1 bg-bg-tertiary border border-bg-border text-text-primary text-xs px-3 py-2 focus:outline-none focus:border-accent-blue uppercase placeholder:normal-case placeholder:text-text-muted"
            />
            <button
              onClick={() => infer.mutate()}
              disabled={infer.isPending || !status.data?.loaded.length}
              className="flex items-center gap-2 px-4 py-2 bg-accent-blue hover:bg-orange-600 text-white text-xs font-medium disabled:opacity-50 transition-colors"
            >
              {infer.isPending ? <LoadingSpinner size="sm" /> : <Play size={12} />}
              {infer.isPending ? "RUNNING..." : "RUN INFERENCE"}
            </button>
          </div>

          {!status.data?.loaded.length && (
            <div className="flex items-center gap-2 text-accent-orange text-xs">
              <AlertTriangle size={12} />
              No models loaded. Train and export models to the configured path, then reload.
            </div>
          )}
        </div>

        {/* Results */}
        {infer.isPending && (
          <div className="flex items-center justify-center h-48">
            <LoadingSpinner label="RUNNING INFERENCE..." size="lg" />
          </div>
        )}

        {inferenceResults.length > 0 && !infer.isPending && (
          <div>
            <SectionLabel>PREDICTIONS</SectionLabel>
            <div className="grid grid-cols-3 gap-3">
              {inferenceResults.map((entry) => (
                <div
                  key={entry.ticker}
                  className={cn(
                    "bg-bg-secondary border p-4 space-y-3",
                    entry.error ? "border-accent-red" : "border-bg-border"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-accent-blue font-semibold text-sm">{entry.ticker}</span>
                    {entry.prediction && (
                      <span className={cn("text-sm font-bold tracking-widest", LABEL_COLORS[entry.prediction] ?? "text-text-primary")}>
                        {entry.prediction}
                      </span>
                    )}
                  </div>

                  {entry.error ? (
                    <div className="text-accent-red text-xs">{entry.error}</div>
                  ) : (
                    <>
                      {entry.confidence !== undefined && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-text-muted">CONFIDENCE</span>
                            <span className="text-text-primary font-medium">
                              {(entry.confidence * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="w-full h-1 bg-bg-tertiary rounded">
                            <div
                              className={cn("h-1 rounded transition-all", LABEL_COLORS[entry.prediction ?? ""] ?? "bg-accent-blue")}
                              style={{ width: `${entry.confidence * 100}%`, background: "currentColor" }}
                            />
                          </div>
                        </div>
                      )}

                      {entry.probabilities && (
                        <div className="space-y-1 pt-1 border-t border-bg-border">
                          {Object.entries(entry.probabilities).map(([label, prob]) => (
                            <div key={label} className="flex justify-between text-xs">
                              <span className={cn("text-xs", LABEL_COLORS[label] ?? "text-text-secondary")}>{label}</span>
                              <span className="text-text-secondary">{(prob * 100).toFixed(1)}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

function ModelCard({ label, path, exists, loaded }: { label: string; path: string; exists: boolean; loaded: boolean }) {
  return (
    <div className="bg-bg-tertiary border border-bg-border p-3">
      <div className="text-text-secondary text-xs uppercase tracking-widest mb-2">{label}</div>
      <div className="text-text-muted text-xs font-mono truncate mb-2" title={path}>{path.split("/").slice(-2).join("/")}</div>
      <div className="flex gap-3">
        <StatusBadge ok={exists} label="ON DISK" />
        <StatusBadge ok={loaded} label="LOADED" />
      </div>
    </div>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn("text-xs px-2 py-0.5 border", ok ? "text-accent-green border-accent-green" : "text-accent-red border-accent-red")}>
      {ok ? label : `NO ${label}`}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-text-secondary text-xs uppercase tracking-widest mb-2">{children}</div>;
}
