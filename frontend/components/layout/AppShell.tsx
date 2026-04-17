"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

const PUBLIC_ROUTES = ["/login", "/register"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, loading } = useAuth();

  const isPublic = PUBLIC_ROUTES.includes(pathname);

  useEffect(() => {
    if (!loading && !user && !isPublic) router.replace("/login");
    if (!loading && user && isPublic)   router.replace("/macro");
  }, [user, loading, isPublic, router]);

  if (isPublic) return <>{children}</>;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-6 h-6 rounded-full border-2 animate-spin"
            style={{ borderColor: "rgba(255,255,255,0.08)", borderTopColor: "var(--orange)" }}
          />
          <span className="text-xs font-medium" style={{ color: "var(--t3)" }}>Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-base)" }}>
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden min-w-0" style={{ marginLeft: 224 }}>
        <TopBar />
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
