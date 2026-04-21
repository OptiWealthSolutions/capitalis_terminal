"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { post, get } from "./api";

export interface AuthUser {
  id: string;
  email: string;
  display_name?: string;
  avatar_url?: string | null;
  auth_provider?: "password" | "google";
  created_at: string;
  subscription: {
    plan: string;
    status: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  };
  plan_limits?: {
    max_portfolios: number | null;
    optimization_methods: string[];
    screener_runs_per_day: number | null;
    pdf_export: boolean;
    monte_carlo: boolean;
    ml_alpha: boolean;
    api_access: boolean;
    tracker_portfolios: number | null;
  };
}

interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

interface RefreshResponse {
  access_token: string;
  token_type: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function storeTokens(pair: TokenPair) {
  sessionStorage.setItem("access_token", pair.access_token);
  localStorage.setItem("refresh_token", pair.refresh_token);
}

function clearTokens() {
  sessionStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    const me = await get<AuthUser>("/auth/me");
    setUser(me);
  }, []);

  useEffect(() => {
    const init = async () => {
      const sessionToken = sessionStorage.getItem("access_token");
      const refreshToken = localStorage.getItem("refresh_token");

      if (sessionToken) {
        try {
          await fetchMe();
        } catch {
          // access token expired — try refresh
          if (refreshToken) {
            try {
              const { access_token } = await post<RefreshResponse>("/auth/refresh", {
                refresh_token: refreshToken,
              });
              sessionStorage.setItem("access_token", access_token);
              await fetchMe();
            } catch {
              clearTokens();
            }
          } else {
            clearTokens();
          }
        }
      } else if (refreshToken) {
        try {
          const { access_token } = await post<RefreshResponse>("/auth/refresh", {
            refresh_token: refreshToken,
          });
          sessionStorage.setItem("access_token", access_token);
          await fetchMe();
        } catch {
          clearTokens();
        }
      }

      setLoading(false);
    };

    init();
  }, [fetchMe]);

  const login = async (email: string, password: string) => {
    const tokens = await post<TokenPair>("/auth/login", { email, password });
    storeTokens(tokens);
    await fetchMe();
  };

  const register = async (email: string, password: string) => {
    const tokens = await post<TokenPair>("/auth/register", { email, password });
    storeTokens(tokens);
    await fetchMe();
  };

  const logout = () => {
    clearTokens();
    setUser(null);
  };

  const refreshUser = async () => {
    await fetchMe();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
