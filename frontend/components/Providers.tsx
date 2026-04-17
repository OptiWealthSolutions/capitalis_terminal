"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/lib/auth";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#1E232F",
              color: "#E6EDF3",
              border: "1px solid #2D3347",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: "12px",
            },
            error: { iconTheme: { primary: "#FF4136", secondary: "#1E232F" } },
            success: { iconTheme: { primary: "#2ECC40", secondary: "#1E232F" } },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}
