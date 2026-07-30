"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      minHeight: "60vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      padding: 32,
      textAlign: "center",
    }}>
      <div style={{
        width: 48,
        height: 48,
        borderRadius: "9999px",
        background: "var(--red-dim)",
        border: "1px solid rgba(186,26,26,0.22)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <AlertTriangle size={20} style={{ color: "var(--red)" }} />
      </div>
      <div>
        <div style={{
          fontSize: "0.95rem",
          fontWeight: 600,
          color: "var(--t1)",
          fontFamily: "Manrope, DM Sans, sans-serif",
          marginBottom: 4,
        }}>
          Something went wrong
        </div>
        <div style={{ fontSize: "0.78rem", color: "var(--t2)", maxWidth: 360 }}>
          {error?.message ?? "An unexpected error occurred."}
        </div>
      </div>
      <button onClick={reset} className="btn-secondary">
        <RefreshCw size={12} />
        Try again
      </button>
    </div>
  );
}
