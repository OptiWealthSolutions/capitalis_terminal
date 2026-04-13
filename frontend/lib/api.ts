/**
 * Centralized API client for CAPITALIS V2 backend.
 * All requests route through /api/* which Next.js proxies to FastAPI.
 * Never hardcode secrets or credentials in this file.
 */

import axios, { AxiosError, AxiosInstance, AxiosResponse } from "axios";
import toast from "react-hot-toast";

const BASE_URL = "/api";

const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 60_000, // 60s for heavy computations (Monte Carlo, optimization)
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  withCredentials: true,
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
        toast.error("Session expired. Please log in again.");
      } else if (status === 429) {
        toast.error("Rate limit reached. Please wait before retrying.");
      } else if (status >= 500) {
        toast.error(`Server error: ${detail}`);
      }
      // 4xx errors are handled at the query level
    } else if (error.code === "ECONNABORTED") {
      toast.error("Request timed out. The computation may be too heavy.");
    } else if (!error.response) {
      toast.error("Backend unreachable. Is the FastAPI server running?");
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

export async function del<T>(path: string): Promise<T> {
  const res = await apiClient.delete<T>(path);
  return res.data;
}

// PDF download — returns Blob for client-side download trigger
export async function downloadPdf(path: string, body: unknown): Promise<Blob> {
  const res = await apiClient.post(path, body, { responseType: "blob" });
  return res.data as Blob;
}

export default apiClient;
