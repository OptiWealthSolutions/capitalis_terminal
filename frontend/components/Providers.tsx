"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { LanguageProvider } from "@/lib/i18n";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
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
}
