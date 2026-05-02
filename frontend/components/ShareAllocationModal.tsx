"use client";

import { useCallback, useState } from "react";
import { Check, Copy, Link as LinkIcon, Lock, Share2, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import toast from "react-hot-toast";
import { errMsg, post } from "@/lib/api";

type ShareResponse = {
  id: string;
  url: string;
  label: string;
  created_at: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  label: string;
  tickers: string[];
  weights: number[];
  method?: string | null;
}

export default function ShareAllocationModal({
  open, onClose, label, tickers, weights, method,
}: Props) {
  const [share, setShare] = useState<ShareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await post<ShareResponse>("/share/portfolio", {
        label, tickers, weights, method,
      });
      setShare(res);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      console.error("[share] create failed", err);
      setError(errMsg(err?.response?.data?.detail ?? err?.message));
    } finally {
      setLoading(false);
    }
  }, [label, tickers, weights, method]);

  const copy = useCallback(async () => {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(share.url);
      setCopied(true);
      toast.success("Lien copié");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Copie impossible");
    }
  }, [share]);

  const close = useCallback(() => {
    onClose();
    setTimeout(() => { setShare(null); setError(null); }, 250);
  }, [onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Partager l'allocation"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          padding: 24,
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
        }}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: "var(--t1)" }}>
              <Share2 size={18} style={{ color: "var(--orange)" }} />
              Partager l&rsquo;allocation
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--t3)" }}>{label}</p>
          </div>
          <button
            onClick={close}
            aria-label="Fermer"
            className="rounded-lg p-1.5"
            style={{ color: "var(--t3)" }}
          >
            <X size={18} />
          </button>
        </div>

        <PrivacyNote />

        {error && (
          <div
            className="mb-4 rounded-lg px-3 py-2 text-sm"
            style={{ background: "rgba(239,68,68,0.08)", color: "#FCA5A5", border: "1px solid rgba(239,68,68,0.2)" }}
            role="alert"
          >
            {error}
          </div>
        )}

        {!share ? (
          <button
            onClick={create}
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? "Création du lien..." : "Générer le lien partagé"}
          </button>
        ) : (
          <ShareReady share={share} copied={copied} onCopy={copy} />
        )}
      </div>
    </div>
  );
}

function PrivacyNote() {
  return (
    <div
      className="mb-5 rounded-lg flex items-start gap-2.5"
      style={{
        padding: "10px 12px",
        background: "var(--bg-inner)",
        border: "1px solid var(--border)",
      }}
    >
      <Lock size={14} style={{ color: "var(--t3)", marginTop: 2, flexShrink: 0 }} />
      <p className="text-xs" style={{ color: "var(--t3)", lineHeight: 1.5 }}>
        Seuls les <strong style={{ color: "var(--t2)" }}>tickers</strong> et leurs{" "}
        <strong style={{ color: "var(--t2)" }}>pourcentages</strong> sont visibles.
        Aucun montant en euros, aucune information personnelle ne sont exposés.
      </p>
    </div>
  );
}

function ShareReady({
  share, copied, onCopy,
}: { share: ShareResponse; copied: boolean; onCopy: () => void }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className="rounded-xl p-4 mb-4"
        style={{ background: "#FFFFFF" }}
      >
        <QRCodeSVG
          value={share.url}
          size={180}
          level="M"
          marginSize={0}
          fgColor="#0A0A0A"
          bgColor="#FFFFFF"
        />
      </div>

      <div
        className="w-full flex items-center gap-2 rounded-lg mb-3"
        style={{
          padding: "8px 10px",
          background: "var(--bg-inner)",
          border: "1px solid var(--border)",
        }}
      >
        <LinkIcon size={14} style={{ color: "var(--t3)", flexShrink: 0 }} />
        <span
          className="flex-1 text-xs truncate"
          style={{ color: "var(--t2)", fontFamily: "ui-monospace, monospace" }}
        >
          {share.url}
        </span>
        <button
          onClick={onCopy}
          aria-label="Copier le lien"
          className="rounded-md flex items-center gap-1 text-xs font-medium transition-colors"
          style={{
            padding: "5px 9px",
            color: copied ? "#22C55E" : "var(--t1)",
            background: copied ? "rgba(34,197,94,0.10)" : "var(--bg-pop)",
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copié" : "Copier"}
        </button>
      </div>

      <p className="text-xs text-center" style={{ color: "var(--t3)" }}>
        Toute personne avec ce lien peut visualiser l&rsquo;allocation et l&rsquo;importer.
      </p>
    </div>
  );
}
