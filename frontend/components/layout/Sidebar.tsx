"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { get } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import {
  LayoutDashboard, Filter, Star, Briefcase, Wallet,
  TrendingUp, FileText, Settings, UserCircle, LogOut, BookOpen,
  Search, Sun, Moon, Bell, ChevronLeft, ChevronRight, Network, Users,
  type LucideProps,
} from "lucide-react";
import type { ForwardRefExoticComponent, RefAttributes } from "react";
import { useTheme } from "@/lib/theme";

type LucideIcon = ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>>;
interface NavItem { href: string; label: string; icon: LucideIcon; badge?: string; section?: string; }

// ─── Logo mark — plain img to avoid next/image optimizer (broken on static export) ──
function CapitalisLogo({ size = 28 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/android-chrome-192x192.png"
      alt="Capitalis"
      width={size}
      height={size}
      style={{ borderRadius: 6, flexShrink: 0, display: "block", objectFit: "cover" }}
    />
  );
}

// ─── NavLink — full + collapsed ───────────────────────────────────────────────
function NavLink({
  item, active, onClose, collapsed,
}: { item: NavItem; active: boolean; onClose?: () => void; collapsed: boolean }) {
  const Icon = item.icon;
  if (collapsed) {
    return (
      <Link
        href={item.href}
        onClick={onClose}
        title={item.label}
        className={cn("flex items-center justify-center py-2 mx-1 rounded transition-all duration-120", active ? "nav-item-active" : "nav-item-inactive")}
        style={{ height: 36 }}
      >
        <Icon size={16} style={{ color: active ? "var(--orange)" : "var(--t3)" }} />
      </Link>
    );
  }
  return (
    <Link
      href={item.href}
      onClick={onClose}
      className={cn("flex items-center gap-2.5 px-3 py-2 font-medium transition-all duration-120 select-none", active ? "nav-item-active" : "nav-item-inactive")}
    >
      <Icon size={15} className="flex-shrink-0" style={{ color: active ? "var(--orange)" : "var(--t3)" }} />
      <span className="flex-1 truncate" style={{ fontSize: "0.8125rem" }}>{item.label}</span>
      {item.badge && (
        <span className="badge badge-violet" style={{ fontSize: "0.5rem", padding: "1px 5px" }}>{item.badge}</span>
      )}
    </Link>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({ isOpen, onClose, isCollapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { t } = useI18n();

  const plan     = user?.subscription?.plan ?? "free";
  const initials = user?.email ? user.email[0].toUpperCase() : "?";

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [tickerResults, setTickerResults] = useState<{ticker: string; name: string; exchange: string}[]>([]);
  const tickerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setSearchOpen(o => !o); }
      if (e.key === "Escape") { setSearchOpen(false); setSearchQuery(""); setTickerResults([]); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (tickerDebounceRef.current) clearTimeout(tickerDebounceRef.current);
    if (!searchQuery.trim() || searchQuery.trim().length < 1) { setTickerResults([]); return; }
    tickerDebounceRef.current = setTimeout(async () => {
      try {
        const data = await get<{results: {ticker: string; name: string; exchange: string}[]}>(
          `/equity/search?q=${encodeURIComponent(searchQuery.trim())}`
        );
        setTickerResults(data.results?.slice(0, 5) ?? []);
      } catch { setTickerResults([]); }
    }, 300);
    return () => { if (tickerDebounceRef.current) clearTimeout(tickerDebounceRef.current); };
  }, [searchQuery]);

  const MAIN_NAV: NavItem[] = [
    { href: "/dashboard",    label: t.nav.dashboard,   icon: LayoutDashboard, section: t.sections.overview },
    { href: "/screener",     label: t.nav.screener,    icon: Filter,          section: t.sections.research },
    { href: "/scorer",       label: t.nav.scorer,      icon: Star },
    { href: "/value-chain",  label: t.nav.valueChain,  icon: Network },
    { href: "/portfolio",    label: t.nav.portfolio,   icon: Briefcase,       section: t.sections.capital },
    { href: "/tracker",      label: t.nav.tracker,     icon: Wallet },
    { href: "/equity",       label: t.nav.equity,      icon: TrendingUp,      section: t.sections.deepDive },
    { href: "/alerts",       label: t.nav.alerts,      icon: Bell },
    { href: "/community",    label: t.nav.community,   icon: Users,       section: "Community" },
    { href: "/reporting",    label: t.nav.reporting,   icon: FileText },
    { href: "/docs",         label: t.nav.docs,        icon: BookOpen },
  ];

  const BOTTOM_NAV: NavItem[] = [
    { href: "/settings", label: t.nav.settings, icon: Settings },
    { href: "/account",  label: t.nav.account,  icon: UserCircle },
  ];

  const ALL_NAV = [...MAIN_NAV, ...BOTTOM_NAV];
  const filteredNav = searchQuery.trim()
    ? ALL_NAV.filter(i => i.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : ALL_NAV;

  const w = isCollapsed ? 56 : 224;

  return (
    <>
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex flex-col transition-all duration-200 ease-in-out",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}
      data-sidebar-dark
      style={{ width: w, background: "var(--bg-surface)", borderRight: "1px solid var(--border)" }}
    >
      {/* ── Logo ── */}
      <div
        className="flex items-center flex-shrink-0 overflow-hidden"
        style={{ height: 52, borderBottom: "1px solid var(--border)", padding: isCollapsed ? "0 14px" : "0 16px", gap: 10 }}
      >
        <CapitalisLogo size={28} />
        {!isCollapsed && (
          <div className="min-w-0">
            <div style={{ fontFamily: "monospace", fontSize: "0.82rem", fontWeight: 700, letterSpacing: "0.04em", color: "var(--t1)", lineHeight: 1, whiteSpace: "nowrap" }}>
              CAPITALIS
            </div>
            <div style={{ fontSize: "0.52rem", color: "var(--t3)", letterSpacing: "0.06em", marginTop: 3, whiteSpace: "nowrap" }}>
              Smarter investing
            </div>
          </div>
        )}
      </div>

      {/* ── Search (expanded only) ── */}
      {!isCollapsed && (
        <div className="px-3 py-2.5 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-2 px-3"
            style={{ height: 32, background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", cursor: "text" }}
          >
            <Search size={12} style={{ color: "var(--t3)", flexShrink: 0 }} />
            <span style={{ fontSize: "0.75rem", color: "var(--t3)" }}>{t.sidebar.search}</span>
            <span className="ml-auto" style={{ fontSize: "0.57rem", color: "var(--t3)", fontFamily: "monospace", background: "var(--bg-hover)", border: "1px solid var(--border)", borderRadius: "3px", padding: "1px 4px" }}>⌘K</span>
          </button>
        </div>
      )}

      {/* ── Collapsed: search icon ── */}
      {isCollapsed && (
        <div className="flex items-center justify-center py-2.5 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <button
            onClick={() => setSearchOpen(true)}
            title={t.sidebar.search}
            className="flex items-center justify-center transition-colors"
            style={{ width: 32, height: 32, borderRadius: "var(--r-sm)", color: "var(--t3)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--t1)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--t3)")}
          >
            <Search size={14} />
          </button>
        </div>
      )}

      {/* ── Nav ── */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5" style={{ padding: isCollapsed ? "12px 0" : "12px 8px" }}>
        {MAIN_NAV.map(item => (
          <div key={item.href}>
            {!isCollapsed && item.section && (
              <p className="section-label px-3 mb-2 mt-3">{item.section}</p>
            )}
            <NavLink
              item={item}
              active={pathname === item.href || pathname.startsWith(item.href + "/")}
              onClose={onClose}
              collapsed={isCollapsed}
            />
          </div>
        ))}
      </nav>

      {/* ── Bottom nav ── */}
      <div className="pt-2 pb-2 space-y-0.5" style={{ borderTop: "1px solid var(--border)", padding: isCollapsed ? "8px 0" : "8px 8px" }}>
        {BOTTOM_NAV.map(item => (
          <NavLink
            key={item.href}
            item={item}
            active={pathname === item.href || pathname.startsWith(item.href + "/")}
            onClose={onClose}
            collapsed={isCollapsed}
          />
        ))}
      </div>

      {/* ── User ── */}
      {!isCollapsed ? (
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex items-center justify-center font-bold flex-shrink-0"
            style={{ width: 30, height: 30, background: "var(--orange-dim)", border: "1px solid var(--orange-border)", borderRadius: "var(--r-sm)", color: "var(--orange)", fontFamily: "monospace", fontSize: "0.78rem" }}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate leading-tight" style={{ color: "var(--t1)", fontSize: "0.75rem" }}>{user?.email ?? ""}</div>
            <span className={cn("badge mt-1", (plan === "premium" || plan === "institutional") ? "badge-green" : plan === "pro" ? "badge-orange" : "")}>
              {(plan === "premium" || plan === "institutional") ? t.user.plan.institutional : plan === "pro" ? "Pro" : t.user.plan.free}
            </span>
          </div>
          <button onClick={toggle} title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="sidebar-theme-btn flex-shrink-0 p-1.5">
            {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
          </button>
          <button onClick={() => { logout(); router.replace("/login"); }} title={t.user.signOut}
            aria-label={t.user.signOut}
            className="sidebar-logout-btn flex-shrink-0 p-1.5">
            <LogOut size={13} />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-3" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex items-center justify-center font-bold"
            style={{ width: 28, height: 28, background: "var(--orange-dim)", border: "1px solid var(--orange-border)", borderRadius: "var(--r-sm)", color: "var(--orange)", fontFamily: "monospace", fontSize: "0.72rem" }}>
            {initials}
          </div>
          <button onClick={toggle} title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="sidebar-theme-btn flex-shrink-0 p-1.5">
            {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
          </button>
          <button onClick={() => { logout(); router.replace("/login"); }} title={t.user.signOut}
            aria-label={t.user.signOut}
            className="sidebar-logout-btn flex-shrink-0 p-1.5">
            <LogOut size={13} />
          </button>
        </div>
      )}

      {/* ── Collapse toggle ── */}
      <button
        onClick={onToggleCollapse}
        title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="sidebar-collapse-btn absolute hidden md:flex items-center justify-center"
        style={{
          right: -12, top: 52 + 8,
          width: 24, height: 24,
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "50%",
          zIndex: 10,
          boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
        }}
      >
        {isCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </aside>

    {/* Search modal */}
    {searchOpen && (
      <div className="fixed inset-0 z-50 flex items-start justify-center"
        style={{ background: "rgba(0,0,0,0.65)", paddingTop: "20vh" }}
        onClick={() => { setSearchOpen(false); setSearchQuery(""); }}>
        <div style={{ width: 440, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}
          onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2 px-3" style={{ height: 44, borderBottom: "1px solid var(--border)" }}>
            <Search size={13} style={{ color: "var(--t3)", flexShrink: 0 }} />
            <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search pages or tickers…"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: "0.8125rem", color: "var(--t1)", fontFamily: "monospace" }} />
            <span style={{ fontSize: "0.55rem", color: "var(--t3)", fontFamily: "monospace", background: "var(--bg-hover)", border: "1px solid var(--border)", borderRadius: "3px", padding: "1px 5px" }}>ESC</span>
          </div>
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            {/* Nav results */}
            {filteredNav.length > 0 && (
              <>
                {searchQuery.trim() && tickerResults.length > 0 && (
                  <div style={{ padding: "6px 14px 2px", fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.08em", color: "var(--t3)", textTransform: "uppercase" }}>
                    Pages
                  </div>
                )}
                {filteredNav.map(item => {
                  const Icon = item.icon;
                  return (
                    <button key={item.href}
                      onClick={() => { router.push(item.href); setSearchOpen(false); setSearchQuery(""); setTickerResults([]); onClose(); }}
                      className="w-full flex items-center gap-3 text-left"
                      style={{ padding: "8px 14px", fontSize: "0.8125rem", color: "var(--t2)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "")}>
                      <Icon size={13} style={{ color: "var(--t3)", flexShrink: 0 }} />
                      {item.label}
                    </button>
                  );
                })}
              </>
            )}

            {/* Ticker results */}
            {tickerResults.length > 0 && (
              <>
                <div style={{ padding: "6px 14px 2px", borderTop: filteredNav.length > 0 ? "1px solid var(--border)" : "none", fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.08em", color: "var(--t3)", textTransform: "uppercase" }}>
                  Stocks & ETFs
                </div>
                {tickerResults.map(item => (
                  <button key={item.ticker}
                    onClick={() => { router.push(`/equity?ticker=${encodeURIComponent(item.ticker)}`); setSearchOpen(false); setSearchQuery(""); setTickerResults([]); onClose(); }}
                    className="w-full flex items-center gap-3 text-left"
                    style={{ padding: "8px 14px", fontSize: "0.8125rem", color: "var(--t2)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "")}>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--orange)", minWidth: 56, fontSize: "0.78rem" }}>{item.ticker}</span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                    <span style={{ fontSize: "0.65rem", color: "var(--t3)", flexShrink: 0 }}>{item.exchange}</span>
                  </button>
                ))}
              </>
            )}

            {filteredNav.length === 0 && tickerResults.length === 0 && searchQuery && (
              <div style={{ fontSize: "0.75rem", color: "var(--t3)", padding: "12px 14px" }}>No results for "{searchQuery}"</div>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
