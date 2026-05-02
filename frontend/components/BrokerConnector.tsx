"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Check, Loader2, Sparkles, X, Zap } from "lucide-react";
import toast from "react-hot-toast";
import { errMsg, get, post } from "@/lib/api";

type Provider = { id: string; name: string; country: string; logo: string };

type SyncStatus = {
  job_id: string;
  status: "running" | "ready" | "imported";
  progress: number;
  step: string;
  step_index: number;
  total_steps: number;
  holdings_count: number | null;
  provider: string;
};

type ImportResult = {
  portfolio_id: string;
  name: string;
  positions_count: number;
  provider: string;
};

type Phase = "select" | "syncing" | "ready" | "success";

const POLL_MS = 700;

interface Props {
  triggerLabel?: string;
  variant?: "primary" | "secondary";
  onImported?: (result: ImportResult) => void;
}

export default function BrokerConnector({
  triggerLabel = "Magic Import",
  variant = "primary",
  onImported,
}: Props) {
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>("select");
  const [selected, setSelected] = useState<Provider | null>(null);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState("");
  const [holdingsCount, setHoldingsCount] = useState<number | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jobIdRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
    jobIdRef.current = null;
    setPhase("select");
    setSelected(null);
    setProgress(0);
    setStep("");
    setHoldingsCount(null);
    setResult(null);
    setError(null);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setTimeout(reset, 250);
  }, [reset]);

  useEffect(() => () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }, []);

  useEffect(() => {
    if (!open || providers.length > 0 || providersLoading) return;
    setProvidersLoading(true);
    get<Provider[]>("/broker/providers")
      .then(setProviders)
      .catch((e) => setError(errMsg(e?.response?.data?.detail)))
      .finally(() => setProvidersLoading(false));
  }, [open, providers.length, providersLoading]);

  const pollStatus = useCallback(async (jobId: string) => {
    try {
      const status = await get<SyncStatus>(`/broker/sync/${jobId}`);
      setProgress(status.progress);
      setStep(status.step);
      if (status.status === "ready") {
        setHoldingsCount(status.holdings_count);
        setPhase("ready");
        return;
      }
      pollTimer.current = setTimeout(() => pollStatus(jobId), POLL_MS);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      setError(errMsg(err?.response?.data?.detail ?? err?.message));
      setPhase("select");
    }
  }, []);

  const startSync = useCallback(async (provider: Provider) => {
    setError(null);
    setSelected(provider);
    setPhase("syncing");
    setProgress(0);
    setStep("Initialisation");
    try {
      const link = await post<{ link_token: string }>("/broker/link", { provider: provider.id });
      const exchange = await post<SyncStatus>("/broker/exchange", {
        public_token: link.link_token,
        provider: provider.id,
      });
      jobIdRef.current = exchange.job_id;
      setStep(exchange.step);
      pollTimer.current = setTimeout(() => pollStatus(exchange.job_id), POLL_MS);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      console.error("[broker] sync start failed", err);
      setError(errMsg(err?.response?.data?.detail ?? err?.message));
      setPhase("select");
    }
  }, [pollStatus]);

  const finalizeImport = useCallback(async () => {
    if (!jobIdRef.current) return;
    try {
      const res = await post<ImportResult>(`/broker/import/${jobIdRef.current}`, {});
      setResult(res);
      setPhase("success");
      toast.success(`${res.positions_count} positions importées depuis ${res.provider}`);
      onImported?.(res);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      console.error("[broker] import failed", err);
      setError(errMsg(err?.response?.data?.detail ?? err?.message));
    }
  }, [onImported]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={variant === "primary" ? "btn-primary" : "btn-secondary"}
        style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
      >
        <Zap size={16} />
        <span>{triggerLabel}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Importer un broker"
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div
            className="w-full max-w-lg rounded-2xl"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              padding: 24,
              boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
            }}
          >
            <Header
              title={titleFor(phase)}
              subtitle={subtitleFor(phase, selected)}
              onClose={close}
            />

            {error && <ErrorBanner message={error} />}

            {phase === "select" && (
              <ProviderGrid
                providers={providers}
                loading={providersLoading}
                onSelect={startSync}
              />
            )}

            {(phase === "syncing" || phase === "ready") && (
              <SyncPanel
                progress={progress}
                step={step}
                ready={phase === "ready"}
                holdingsCount={holdingsCount}
                onConfirm={finalizeImport}
              />
            )}

            {phase === "success" && result && (
              <SuccessPanel result={result} onClose={close} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function titleFor(phase: Phase): string {
  if (phase === "select") return "Connectez votre broker";
  if (phase === "syncing") return "Magic Import en cours";
  if (phase === "ready") return "Synchronisation terminée";
  return "Import réussi";
}

function subtitleFor(phase: Phase, p: Provider | null): string {
  if (phase === "select") return "Choisissez votre broker. Connexion sécurisée via Open Banking.";
  if (phase === "syncing") return p ? `Récupération de vos positions ${p.name}...` : "";
  if (phase === "ready") return p ? `Vos positions ${p.name} sont prêtes.` : "";
  return "Vos positions ont été ajoutées au tracker.";
}

function Header({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: "var(--t1)" }}>
          <Sparkles size={18} style={{ color: "var(--orange)" }} />
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm mt-1" style={{ color: "var(--t3)" }}>{subtitle}</p>
        )}
      </div>
      <button
        onClick={onClose}
        aria-label="Fermer"
        className="rounded-lg p-1.5 transition-colors"
        style={{ color: "var(--t3)", background: "transparent" }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <X size={18} />
      </button>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="mb-4 rounded-lg px-3 py-2 text-sm"
      style={{ background: "rgba(239,68,68,0.08)", color: "#FCA5A5", border: "1px solid rgba(239,68,68,0.2)" }}
      role="alert"
    >
      {message}
    </div>
  );
}

function ProviderGrid({
  providers, loading, onSelect,
}: { providers: Provider[]; loading: boolean; onSelect: (p: Provider) => void }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-10" style={{ color: "var(--t3)" }}>
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2.5 max-h-[340px] overflow-y-auto pr-1">
      {providers.map((p) => (
        <button
          key={p.id}
          onClick={() => onSelect(p)}
          className="flex items-center gap-3 rounded-xl text-left transition-all"
          style={{
            padding: "12px 14px",
            background: "var(--bg-inner)",
            border: "1px solid var(--border)",
            color: "var(--t1)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.borderColor = "var(--border-hi)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--bg-inner)";
            e.currentTarget.style.borderColor = "var(--border)";
          }}
        >
          <span
            className="flex items-center justify-center rounded-lg text-sm font-bold flex-shrink-0"
            style={{
              width: 36, height: 36,
              background: "var(--bg-pop)",
              color: "var(--t2)",
              letterSpacing: "0.05em",
            }}
          >
            {p.logo}
          </span>
          <span className="flex flex-col min-w-0">
            <span className="text-sm font-medium truncate">{p.name}</span>
            <span className="text-xs" style={{ color: "var(--t3)" }}>{p.country}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function SyncPanel({
  progress, step, ready, holdingsCount, onConfirm,
}: {
  progress: number;
  step: string;
  ready: boolean;
  holdingsCount: number | null;
  onConfirm: () => void;
}) {
  return (
    <div className="py-2">
      <div
        className="flex items-center justify-center mb-5 mx-auto rounded-full"
        style={{
          width: 64, height: 64,
          background: ready ? "rgba(34,197,94,0.12)" : "rgba(96,165,250,0.10)",
          color: ready ? "#22C55E" : "#60A5FA",
          transition: "background 350ms ease, color 350ms ease",
        }}
      >
        {ready ? <Check size={28} /> : <Building2 size={28} className="animate-pulse" />}
      </div>

      <div className="mb-2 flex items-center justify-between text-xs" style={{ color: "var(--t3)" }}>
        <span>{step}</span>
        <span>{progress}%</span>
      </div>
      <div
        className="rounded-full overflow-hidden mb-5"
        style={{ height: 6, background: "var(--bg-inner)" }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: "100%",
            background: ready
              ? "linear-gradient(90deg, #22C55E, #16A34A)"
              : "linear-gradient(90deg, #60A5FA, #818CF8)",
            transition: "width 480ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      </div>

      {ready && (
        <div className="text-center">
          <p className="text-sm mb-4" style={{ color: "var(--t2)" }}>
            <strong style={{ color: "var(--t1)" }}>{holdingsCount}</strong> positions détectées
          </p>
          <button onClick={onConfirm} className="btn-primary w-full">
            Importer dans mon tracker
          </button>
        </div>
      )}
    </div>
  );
}

function SuccessPanel({ result, onClose }: { result: ImportResult; onClose: () => void }) {
  return (
    <div className="py-2 text-center">
      <div
        className="flex items-center justify-center mb-4 mx-auto rounded-full"
        style={{
          width: 64, height: 64,
          background: "rgba(34,197,94,0.12)",
          color: "#22C55E",
        }}
      >
        <Check size={28} />
      </div>
      <p className="text-sm mb-1" style={{ color: "var(--t1)" }}>
        <strong>{result.positions_count}</strong> positions importées
      </p>
      <p className="text-xs mb-5" style={{ color: "var(--t3)" }}>
        Portfolio: {result.name}
      </p>
      <button onClick={onClose} className="btn-primary w-full">
        Voir mon portefeuille
      </button>
    </div>
  );
}
