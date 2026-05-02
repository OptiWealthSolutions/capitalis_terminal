"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BarChart2, Eye, EyeOff, UserPlus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import GoogleButton from "@/components/auth/GoogleButton";
import toast from "react-hot-toast";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const { t } = useI18n();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { toast.error("Passwords do not match."); return; }
    if (password.length < 8)  { toast.error("Password must be at least 8 characters."); return; }

    setLoading(true);
    try {
      await register(email, password);
      toast.success("Account created.");
      router.replace("/dashboard");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Registration failed.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "var(--bg-base)", border: "1px solid var(--border)",
    borderRadius: "var(--r-sm)", color: "var(--t1)", fontSize: "0.78rem",
    padding: "10px 12px", outline: "none", 
    boxSizing: "border-box",
  };

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg-base)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px",
    }}>
      <div style={{ width: "100%", maxWidth: 380 }}>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 40, justifyContent: "center" }}>
          <div style={{
            width: 34, height: 34, borderRadius: "var(--r-sm)",
            background: "var(--orange-dim)", border: "1px solid var(--orange-border)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <BarChart2 size={16} style={{ color: "var(--orange)" }} />
          </div>
          <div>
            <div style={{ color: "var(--t1)", fontWeight: 700, fontSize: "0.85rem", letterSpacing: "0.12em" }}>CAPITALIS</div>
            <div style={{ color: "var(--t3)", fontSize: "0.65rem", letterSpacing: "0.1em" }}>{t.auth.register.tagline}</div>
          </div>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: "28px 32px" }}>
          <div style={{ fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 24 }}>
            {t.auth.register.title}
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            <div>
              <label style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--t3)", display: "block", marginBottom: 6 }}>
                {t.auth.register.email}
              </label>
              <input
                type="email" autoComplete="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--orange)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
              />
            </div>

            <div>
              <label style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--t3)", display: "block", marginBottom: 6 }}>
                {t.auth.register.password}
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"} autoComplete="new-password" required
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  style={{ ...inputStyle, paddingRight: 36 }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--orange)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                />
                <button
                  type="button" onClick={() => setShowPw((v) => !v)} tabIndex={-1}
                  style={{
                    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", color: "var(--t3)",
                    display: "flex", alignItems: "center",
                  }}
                >
                  {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>

            <div>
              <label style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--t3)", display: "block", marginBottom: 6 }}>
                {t.auth.register.confirmPassword}
              </label>
              <input
                type={showPw ? "text" : "password"} autoComplete="new-password" required
                value={confirm} onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat password"
                style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--orange)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
              />
            </div>

            <button
              type="submit" disabled={loading}
              className="btn-primary"
              style={{ width: "100%", marginTop: 4, justifyContent: "center", opacity: loading ? 0.7 : 1 }}
            >
              {loading ? (
                <div style={{ width: 14, height: 14, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              ) : (
                <><UserPlus size={13} /> CREATE ACCOUNT</>
              )}
            </button>
          </form>

          {/* OR divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0" }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span style={{ color: "var(--t3)", fontSize: "0.62rem", letterSpacing: "0.1em" }}>OR</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          <GoogleButton redirectTo="/dashboard" text="signup_with" />

          <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--border)", textAlign: "center" }}>
            <span style={{ color: "var(--t3)", fontSize: "0.72rem" }}>{t.auth.register.hasAccount} </span>
            <Link href="/login" style={{ color: "var(--orange)", fontSize: "0.72rem" }}>{t.auth.register.signIn}</Link>
          </div>
        </div>

        <div style={{ marginTop: 16, textAlign: "center", color: "var(--t3)", fontSize: "0.65rem", opacity: 0.5 }}>
          CAPITALIS V2 — build 2.0.0
        </div>
      </div>
    </div>
  );
}
