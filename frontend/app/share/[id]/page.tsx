"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Lock, Sparkles, TrendingUp } from "lucide-react";
import { errMsg, get } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type SharePayload = {
  id: string;
  label: string;
  tickers: string[];
  weights: number[];
  method: string | null;
  created_at: string;
};

const PALETTE = [
  "#2563EB", "#60A5FA", "#22C55E", "#F59E0B", "#EF4444",
  "#A855F7", "#06B6D4", "#EC4899", "#84CC16", "#F97316",
  "#14B8A6", "#8B5CF6", "#FBBF24", "#10B981", "#3B82F6",
];

export default function SharePreviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<SharePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.id) return;
    get<SharePayload>(`/share/public/${params.id}`)
      .then(setData)
      .catch((e: unknown) => {
        const err = e as { response?: { status?: number; data?: { detail?: string } } };
        if (err?.response?.status === 404) setError("Cette allocation n'existe plus.");
        else setError(errMsg(err?.response?.data?.detail));
      })
      .finally(() => setLoading(false));
  }, [params?.id]);

  const sorted = useMemo(() => {
    if (!data) return [];
    return data.tickers
      .map((t, i) => ({ ticker: t, weight: data.weights[i] ?? 0, color: PALETTE[i % PALETTE.length] }))
      .sort((a, b) => b.weight - a.weight);
  }, [data]);

  function handleTryStrategy() {
    if (!data) return;
    if (user) {
      sessionStorage.setItem("capitalis_imported_allocation", JSON.stringify({
        tickers: data.tickers,
        weights: data.weights,
        label: data.label,
        method: data.method,
      }));
      router.push("/portfolio?import=share");
      return;
    }
    sessionStorage.setItem("capitalis_pending_share", data.id);
    router.push(`/register?from=share&id=${encodeURIComponent(data.id)}`);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: "var(--bg-base)", color: "var(--t1)" }}
    >
      <div className="w-full max-w-2xl">
        <div className="text-center mb-6">
          <div
            className="inline-flex items-center gap-1.5 rounded-full text-xs font-medium mb-3"
            style={{
              padding: "5px 11px",
              background: "var(--orange-dim)",
              color: "var(--orange)",
              border: "1px solid var(--orange-border)",
            }}
          >
            <Sparkles size={12} />
            Allocation partagée
          </div>
          {loading || authLoading ? (
            <div className="h-7" />
          ) : data ? (
            <>
              <h1 className="text-2xl font-semibold tracking-tight mb-1.5">{data.label}</h1>
              <p className="text-sm" style={{ color: "var(--t3)" }}>
                {data.tickers.length} actifs
                {data.method && <> · {data.method}</>}
              </p>
            </>
          ) : (
            <h1 className="text-2xl font-semibold">Allocation indisponible</h1>
          )}
        </div>

        {loading ? (
          <SkeletonCard />
        ) : error ? (
          <ErrorCard message={error} />
        ) : data ? (
          <>
            <AllocationCard rows={sorted} />
            <PrivacyBlock />
            <CTABlock authenticated={!!user} onTry={handleTryStrategy} />
          </>
        ) : null}
      </div>
    </div>
  );
}

function AllocationCard({ rows }: { rows: { ticker: string; weight: number; color: string }[] }) {
  return (
    <div
      className="rounded-2xl mb-5"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        padding: 22,
      }}
    >
      <StackedBar rows={rows} />
      <div className="mt-5 grid gap-1.5">
        {rows.map((r) => (
          <div
            key={r.ticker}
            className="flex items-center justify-between rounded-lg"
            style={{ padding: "8px 12px", background: "var(--bg-inner)" }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                style={{ width: 9, height: 9, borderRadius: 999, background: r.color, flexShrink: 0 }}
              />
              <span className="text-sm font-medium truncate">{r.ticker}</span>
            </div>
            <span className="text-sm tabular-nums" style={{ color: "var(--t2)" }}>
              {r.weight.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StackedBar({ rows }: { rows: { ticker: string; weight: number; color: string }[] }) {
  return (
    <div className="flex w-full overflow-hidden rounded-lg" style={{ height: 14 }}>
      {rows.map((r) => (
        <div
          key={r.ticker}
          title={`${r.ticker} ${r.weight.toFixed(2)}%`}
          style={{ width: `${r.weight}%`, background: r.color }}
        />
      ))}
    </div>
  );
}

function PrivacyBlock() {
  return (
    <div
      className="flex items-start gap-2.5 rounded-lg mb-6"
      style={{
        padding: "10px 14px",
        background: "var(--bg-inner)",
        border: "1px solid var(--border)",
      }}
    >
      <Lock size={14} style={{ color: "var(--t3)", marginTop: 2 }} />
      <p className="text-xs" style={{ color: "var(--t3)", lineHeight: 1.5 }}>
        Cette allocation ne contient ni montants en euros, ni informations personnelles.
        Seuls les tickers et leurs pourcentages sont partagés.
      </p>
    </div>
  );
}

function CTABlock({ authenticated, onTry }: { authenticated: boolean; onTry: () => void }) {
  return (
    <div className="text-center">
      <button
        onClick={onTry}
        className="btn-primary inline-flex items-center gap-2"
        style={{ padding: "12px 22px", fontSize: 14 }}
      >
        <TrendingUp size={16} />
        Tester cette stratégie
        <ArrowRight size={14} />
      </button>
      <p className="text-xs mt-3" style={{ color: "var(--t3)" }}>
        {authenticated
          ? "Importer dans votre Portfolio Builder."
          : "Créez un compte gratuit pour backtest, optimiser et tracker."}
      </p>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="rounded-2xl animate-pulse"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)", padding: 22, height: 360 }}
    />
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div
      className="rounded-2xl text-center"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        padding: 32,
        color: "var(--t2)",
      }}
    >
      <p className="text-sm">{message}</p>
    </div>
  );
}
