"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Activity } from "lucide-react";
import { useAuth } from "@/lib/auth";
import toast from "react-hot-toast";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      await login(email, password);
      router.replace("/macro");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? "Login failed.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--base)" }}
    >
      <div className="w-full max-w-[380px]">

        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div
            className="flex items-center justify-center w-12 h-12 rounded-xl mb-5"
            style={{
              background: "var(--orange-dim)",
              border: "1px solid var(--orange-border)",
            }}
          >
            <Activity size={22} style={{ color: "var(--orange)" }} />
          </div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
            CAPITALIS
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--ink-2)" }}>
            Institutional Quantitative Terminal
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-xl p-8"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
          }}
        >
          <h2 className="text-base font-semibold mb-1" style={{ color: "var(--ink)" }}>
            Sign in
          </h2>
          <p className="text-sm mb-7" style={{ color: "var(--ink-2)" }}>
            Enter your credentials to continue.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold" style={{ color: "var(--ink-2)" }}>
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="input-field"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold" style={{ color: "var(--ink-2)" }}>
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-field"
                  style={{ paddingRight: 40 }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "var(--ink-3)" }}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? (
                <div
                  className="w-4 h-4 rounded-full border-2 animate-spin"
                  style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }}
                />
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <div
            className="mt-6 pt-5 text-center text-sm"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <span style={{ color: "var(--ink-2)" }}>No account? </span>
            <Link
              href="/register"
              className="font-semibold transition-colors"
              style={{ color: "var(--orange)" }}
            >
              Create one
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-xxs" style={{ color: "var(--ink-3)" }}>
          Capitalis v2.0 — Institutional use only
        </p>
      </div>
    </div>
  );
}
