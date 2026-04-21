"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { LanguageProvider } from "@/lib/i18n";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

export default function Providers({ children }: { children: React.ReactNode }) {
  const tree = (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
      <ThemeProvider>
      <AuthProvider>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--surface)",
              color: "var(--ink)",
              border: "1px solid var(--border)",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: "12px",
            },
            error: { iconTheme: { primary: "var(--red)", secondary: "var(--surface)" } },
            success: { iconTheme: { primary: "var(--green)", secondary: "var(--surface)" } },
          }}
        />
      </AuthProvider>
      </ThemeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );

  // Only wrap in GoogleOAuthProvider if a client ID is configured, to avoid
  // throwing during development when Google OAuth isn't set up yet.
  return GOOGLE_CLIENT_ID ? (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{tree}</GoogleOAuthProvider>
  ) : tree;
}
