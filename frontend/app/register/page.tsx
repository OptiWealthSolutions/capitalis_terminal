"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Activity, Eye, EyeOff, UserPlus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import toast from "react-hot-toast";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      await register(email, password);
      toast.success("Account created.");
      router.replace("/macro");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Registration failed.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-10 justify-center">
          <div className="w-8 h-8 rounded-md bg-accent-blue/10 border border-accent-blue/30 flex items-center justify-center">
            <Activity size={16} className="text-accent-blue" />
          </div>
          <div>
            <div className="text-text-primary font-semibold text-sm tracking-widest">CAPITALIS</div>
            <div className="text-text-muted text-xs tracking-widest">V2 TERMINAL</div>
          </div>
        </div>

        {/* Card */}
        <div className="bg-bg-secondary border border-bg-border rounded-md p-7 shadow-card">
          <div className="text-text-secondary text-xs uppercase tracking-widest mb-6">
            Create Account
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-text-muted text-xs uppercase tracking-wider">Email</label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-bg-tertiary border border-bg-border rounded-md text-text-primary text-xs px-3 py-2.5 focus:outline-none focus:border-accent-blue focus:shadow-glow font-mono transition-all placeholder:text-text-muted"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-text-muted text-xs uppercase tracking-wider">Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="w-full bg-bg-tertiary border border-bg-border rounded-md text-text-primary text-xs px-3 py-2.5 pr-9 focus:outline-none focus:border-accent-blue focus:shadow-glow font-mono transition-all placeholder:text-text-muted"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-text-muted text-xs uppercase tracking-wider">Confirm Password</label>
              <input
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat password"
                className="w-full bg-bg-tertiary border border-bg-border rounded-md text-text-primary text-xs px-3 py-2.5 focus:outline-none focus:border-accent-blue focus:shadow-glow font-mono transition-all placeholder:text-text-muted"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-accent-blue hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-black text-xs font-semibold rounded-md transition-all hover:shadow-glow mt-2"
            >
              {loading ? (
                <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <UserPlus size={13} />
                  CREATE ACCOUNT
                </>
              )}
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-bg-border text-center">
            <span className="text-text-muted text-xs">Already have an account? </span>
            <Link
              href="/login"
              className="text-xs text-accent-blue hover:text-orange-500 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>

        <div className="mt-4 text-center text-text-muted text-xs opacity-50">
          CAPITALIS V2 — build 2.0.0
        </div>
      </div>
    </div>
  );
}
