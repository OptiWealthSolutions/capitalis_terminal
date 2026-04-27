"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useInvestorMode } from "@/lib/investorMode";
import InvestorProfileModal from "@/components/InvestorProfileModal";
import OnboardingTour from "@/components/onboarding/OnboardingTour";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";

const PUBLIC_ROUTES = ["/login", "/register"];
const COLLAPSE_KEY = "capitalis_sidebar_collapsed";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, loading } = useAuth();
  const { profile, showProfileModal, openProfileModal } = useInvestorMode();
  const [sidebarOpen, setSidebarOpen]         = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const isPublic = PUBLIC_ROUTES.includes(pathname);

  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSE_KEY);
    if (stored === "1") setSidebarCollapsed(true);
  }, []);

  function toggleCollapse() {
    setSidebarCollapsed(v => {
      const next = !v;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  useEffect(() => {
    if (!loading && !user && !isPublic) router.replace("/login");
    if (!loading && user && isPublic)   router.replace("/dashboard");
  }, [user, loading, isPublic, router]);

  // Show profile onboarding once on first login — but ONLY after the tour
  // has been seen/dismissed. The OnboardingTour writes
  // `capitalis_tour_seen_v1` on close; we gate the profile modal on it.
  useEffect(() => {
    if (loading || !user || isPublic || profile) return;
    const tourSeen = (() => { try { return localStorage.getItem("capitalis_tour_seen_v1") === "1"; } catch { return false; } })();
    if (!tourSeen) return; // wait until tour is done
    const dismissed = sessionStorage.getItem("capitalis_profile_modal_dismissed");
    if (!dismissed) openProfileModal();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, isPublic, profile]);

  // Re-check when the tour closes — listen to storage event + custom flag
  useEffect(() => {
    function recheck() {
      if (loading || !user || isPublic || profile) return;
      const tourSeen = (() => { try { return localStorage.getItem("capitalis_tour_seen_v1") === "1"; } catch { return false; } })();
      if (!tourSeen) return;
      const dismissed = sessionStorage.getItem("capitalis_profile_modal_dismissed");
      if (!dismissed) openProfileModal();
    }
    window.addEventListener("capitalis:tour-closed", recheck);
    window.addEventListener("storage", recheck);
    return () => {
      window.removeEventListener("capitalis:tour-closed", recheck);
      window.removeEventListener("storage", recheck);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, isPublic, profile]);

  // Close sidebar on route change (mobile nav)
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  if (isPublic) return <>{children}</>;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-6 h-6 rounded-full border-2 animate-spin"
            style={{ borderColor: "rgba(255,255,255,0.08)", borderTopColor: "var(--orange)" }} />
          <span className="text-xs font-medium" style={{ color: "var(--t3)" }}>Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-base)" }}>
      {showProfileModal && <InvestorProfileModal />}
      <OnboardingTour />
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={toggleCollapse}
      />
      <div
        className={`flex flex-col flex-1 overflow-hidden min-w-0 transition-all duration-200 ${sidebarCollapsed ? "sidebar-content-collapsed" : "sidebar-content"}`}
      >
        <TopBar onMenuToggle={() => setSidebarOpen(o => !o)} />
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
