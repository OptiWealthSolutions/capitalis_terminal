/**
 * Centralized API client for CAPITALIS V2 backend.
 * All requests route through /api/* which Next.js proxies to FastAPI.
 * Never hardcode secrets or credentials in this file.
 */

import axios, { AxiosError, AxiosInstance, AxiosResponse } from "axios";
import toast from "react-hot-toast";

// In prod (static export): NEXT_PUBLIC_API_URL=https://api.capitalis.io → calls backend directly
// In dev: no env var set → "/api" is proxied by Next.js rewrite to localhost:8000
const BASE_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api`
  : "/api";

const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 60_000, // 60s for heavy computations (Monte Carlo, optimization)
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  withCredentials: false,
});

// ---------------------------------------------------------------------------
// Request interceptor — attach JWT token if present
// ---------------------------------------------------------------------------
apiClient.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = sessionStorage.getItem("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// ---------------------------------------------------------------------------
// Response interceptor — normalize errors, surface to user
// ---------------------------------------------------------------------------
const IS_PROD = process.env.NODE_ENV === "production";
export const GENERIC_ERROR_MSG = "Erreur, impossible de charger";

/** Safe error message — returns generic message in production, detail in dev. */
export function errMsg(detail?: string | null): string {
  if (IS_PROD) return GENERIC_ERROR_MSG;
  return detail || GENERIC_ERROR_MSG;
}

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError<{ detail?: string; status?: string }>) => {
    if (error.response) {
      const status = error.response.status;
      const detail = error.response.data?.detail ?? "An unexpected error occurred.";

      if (status === 401) {
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("access_token");
        }
        toast.error(IS_PROD ? GENERIC_ERROR_MSG : "Session expired. Please log in again.");
      } else if (status === 429) {
        toast.error(IS_PROD ? GENERIC_ERROR_MSG : "Rate limit reached. Please wait before retrying.");
      } else if (status >= 500) {
        if (IS_PROD) {
          console.error("[api]", status, detail);
          toast.error(GENERIC_ERROR_MSG);
        } else {
          toast.error(`Server error: ${detail}`);
        }
      }
    } else if (error.code === "ECONNABORTED") {
      toast.error(IS_PROD ? GENERIC_ERROR_MSG : "Request timed out. The computation may be too heavy.");
    } else if (!error.response) {
      toast.error(IS_PROD ? GENERIC_ERROR_MSG : "Backend unreachable. Is the FastAPI server running?");
    }
    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------------------
// Typed helpers
// ---------------------------------------------------------------------------
export async function get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const res = await apiClient.get<T>(path, { params });
  return res.data;
}

export async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await apiClient.post<T>(path, body);
  return res.data;
}

export async function put<T>(path: string, body?: unknown): Promise<T> {
  const res = await apiClient.put<T>(path, body);
  return res.data;
}

export async function del<T>(path: string, body?: unknown): Promise<T> {
  const res = await apiClient.delete<T>(path, body ? { data: body } : undefined);
  return res.data;
}

export async function patch<T>(path: string, body?: unknown): Promise<T> {
  const res = await apiClient.patch<T>(path, body);
  return res.data;
}

// PDF download — returns Blob for client-side download trigger
export async function downloadPdf(path: string, body: unknown): Promise<Blob> {
  const res = await apiClient.post(path, body, { responseType: "blob" });
  return res.data as Blob;
}

export default apiClient;
