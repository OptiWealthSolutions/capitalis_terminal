"use client";

import { GoogleLogin, CredentialResponse } from "@react-oauth/google";
import { useRouter } from "next/navigation";
import { post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import toast from "react-hot-toast";

interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

interface Props {
  /** Route to redirect to on successful login. Default /dashboard. */
  redirectTo?: string;
  /** Override label shown by the Google widget. */
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
}

/**
 * Renders the Google-issued Sign-In button. When clicked, receives a JWT
 * `credential` (id_token) which is posted to /auth/google on our backend.
 * Backend verifies it against GOOGLE_CLIENT_ID, then returns a token pair.
 *
 * Silently renders nothing if NEXT_PUBLIC_GOOGLE_CLIENT_ID is missing.
 */
export default function GoogleButton({ redirectTo = "/dashboard", text = "continue_with" }: Props) {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const configured = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

  if (!configured) {
    return (
      <div
        style={{
          padding: "10px 12px",
          textAlign: "center",
          fontSize: "0.68rem",
          color: "var(--t3)",
          border: "1px dashed var(--border)",
          borderRadius: "var(--r-sm)",
          letterSpacing: "0.04em",
        }}
      >
        Google Sign-In not configured. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID.
      </div>
    );
  }

  const handleSuccess = async (res: CredentialResponse) => {
    if (!res.credential) {
      toast.error("Google did not return a credential.");
      return;
    }
    try {
      const pair = await post<TokenPair>("/auth/google", { id_token: res.credential });
      sessionStorage.setItem("access_token", pair.access_token);
      localStorage.setItem("refresh_token", pair.refresh_token);
      await refreshUser();
      router.replace(redirectTo);
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? "Google sign-in failed.";
      toast.error(detail);
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
      <GoogleLogin
        onSuccess={handleSuccess}
        onError={() => toast.error("Google sign-in cancelled.")}
        text={text}
        theme="filled_black"
        shape="rectangular"
        width="320"
      />
    </div>
  );
}
