"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import GoogleButton from "@/components/auth/GoogleButton";
import toast from "react-hot-toast";

const FEATURES = [
  { label: "Institutional-grade analytics", desc: "Factor models, DCF, comps — all in one terminal." },
  { label: "Multi-asset coverage",          desc: "Equities, ETFs, crypto across 60+ exchanges." },
  { label: "Portfolio risk engine",         desc: "Real-time VaR, drawdown attribution, stress tests." },
];

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useI18n();

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
      router.replace("/dashboard");
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
      className="min-h-screen flex"
      style={{ background: "var(--bg-surface)" }}
    >
      {/* ── Left brand panel (40%) ───────────────────────────────────────── */}
      <div
        className="hidden lg:flex flex-col justify-between px-12 py-14"
        style={{
          width: "40%",
          flexShrink: 0,
          borderRight: "1px solid var(--card-border)",
        }}
      >
        {/* Wordmark */}
        <div>
          <div className="flex items-center gap-2.5 mb-16">
            <span
              style={{
                fontFamily: "Manrope, sans-serif",
                fontWeight: 700,
                fontSize: "1.125rem",
                letterSpacing: "-0.015em",
                color: "var(--orange)",
              }}
            >
              CAPITALIS
            </span>
            <span
              style={{
                fontSize: "0.625rem",
                fontWeight: 600,
                letterSpacing: "0.12em",
                color: "var(--t3)",
                textTransform: "uppercase",
                marginTop: 2,
              }}
            >
              Terminal
            </span>
          </div>

          {/* Tagline */}
          <p
            style={{
              fontFamily: "Manrope, sans-serif",
              fontWeight: 700,
              fontSize: "1.75rem",
              lineHeight: 1.25,
              letterSpacing: "-0.015em",
              color: "var(--t1)",
              marginBottom: "2.5rem",
              maxWidth: 280,
            }}
          >
            Institutional-grade analysis for active investors.
          </p>

          {/* Feature list */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {FEATURES.map((f) => (
              <div key={f.label}>
                <div
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    color: "var(--t1)",
                    marginBottom: "0.2rem",
                  }}
                >
                  {f.label}
                </div>
                <div style={{ fontSize: "0.8125rem", color: "var(--t3)" }}>
                  {f.desc}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <p style={{ fontSize: "0.6875rem", color: "var(--t3)", letterSpacing: "0.02em" }}>
          Capitalis v2 &middot; Restricted access
        </p>
      </div>

      {/* ── Right form panel (60%) ───────────────────────────────────────── */}
      <div
        className="flex flex-1 items-center justify-center px-6 py-12"
        style={{ minHeight: "100vh" }}
      >
        <div style={{ width: "100%", maxWidth: 420 }}>

          {/* Mobile-only wordmark */}
          <div className="flex lg:hidden items-center gap-2 mb-10">
            <span
              style={{
                fontFamily: "Manrope, sans-serif",
                fontWeight: 700,
                fontSize: "1rem",
                letterSpacing: "-0.015em",
                color: "var(--orange)",
              }}
            >
              CAPITALIS
            </span>
          </div>

          {/* Form card */}
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--card-border)",
              borderRadius: "var(--r-xl)",
              padding: "2rem 2rem 1.75rem",
            }}
          >
            <h2
              style={{
                fontFamily: "Manrope, sans-serif",
                fontWeight: 700,
                fontSize: "1.125rem",
                letterSpacing: "-0.015em",
                color: "var(--t1)",
                marginBottom: "0.25rem",
              }}
            >
              {t.auth.login.title}
            </h2>
            <p style={{ fontSize: "0.8125rem", color: "var(--t3)", marginBottom: "1.75rem" }}>
              {t.auth.login.subtitle}
            </p>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Email */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                <label
                  style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--t2)" }}
                >
                  {t.auth.login.email}
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@institution.com"
                  required
                  style={{
                    background: "var(--bg-inner)",
                    border: "1px solid var(--card-border)",
                    borderRadius: "var(--r-md)",
                    padding: "10px 14px",
                    color: "var(--t1)",
                    fontSize: "0.875rem",
                    outline: "none",
                    width: "100%",
                    transition: "border-color 0.15s",
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = "var(--orange)")}
                  onBlur={e  => (e.currentTarget.style.borderColor = "var(--card-border)")}
                />
              </div>

              {/* Password */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <label
                    style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--t2)" }}
                  >
                    {t.auth.login.password}
                  </label>
                  <button
                    type="button"
                    tabIndex={-1}
                    style={{
                      fontSize: "0.6875rem",
                      color: "var(--t3)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = "var(--orange)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "var(--t3)")}
                  >
                    Forgot password?
                  </button>
                </div>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    style={{
                      background: "var(--bg-inner)",
                      border: "1px solid var(--card-border)",
                      borderRadius: "var(--r-md)",
                      padding: "10px 40px 10px 14px",
                      color: "var(--t1)",
                      fontSize: "0.875rem",
                      outline: "none",
                      width: "100%",
                      transition: "border-color 0.15s",
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = "var(--orange)")}
                    onBlur={e  => (e.currentTarget.style.borderColor = "var(--card-border)")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    tabIndex={-1}
                    title={t.auth.login.showPassword}
                    style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--t3)",
                      display: "flex",
                      padding: 0,
                    }}
                  >
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  background: "var(--orange)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "var(--r-md)",
                  padding: "12px 0",
                  width: "100%",
                  fontFamily: "Manrope, sans-serif",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.6 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  marginTop: "0.25rem",
                  transition: "opacity 0.15s",
                }}
              >
                {loading ? (
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "#fff",
                      animation: "spin 0.7s linear infinite",
                    }}
                  />
                ) : (
                  t.auth.login.submit
                )}
              </button>
            </form>

            {/* OR divider + Google */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "1.25rem 0" }}>
              <div style={{ flex: 1, height: 1, background: "var(--card-border)" }} />
              <span style={{ fontSize: "0.625rem", letterSpacing: "0.1em", color: "var(--t3)" }}>OR</span>
              <div style={{ flex: 1, height: 1, background: "var(--card-border)" }} />
            </div>

            <GoogleButton redirectTo="/dashboard" text="signin_with" />
          </div>

          {/* Footer */}
          <p
            style={{
              marginTop: "1.5rem",
              textAlign: "center",
              fontSize: "0.6875rem",
              color: "var(--t3)",
            }}
          >
            Capitalis &middot; Institutional access only
          </p>
        </div>
      </div>
    </div>
  );
}
