"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import {
  LayoutDashboard, Brain, Filter, Star, Briefcase, Wallet,
  TrendingUp, FileText, Settings, UserCircle, LogOut, Activity, BookOpen,
  Search, Sun, Moon,
  type LucideProps,
} from "lucide-react";
import type { ForwardRefExoticComponent, RefAttributes } from "react";
import { useTheme } from "@/lib/theme";

type LucideIcon = ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>>;
interface NavItem { href: string; label: string; icon: LucideIcon; badge?: string; section?: string; }

function NavLink({ item, active, onClose }: { item: NavItem; active: boolean; onClose?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClose}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 font-medium transition-all duration-120 select-none",
        active ? "nav-item-active" : "nav-item-inactive"
      )}
    >
      <Icon
        size={15}
        className="flex-shrink-0"
        style={{ color: active ? "var(--orange)" : "var(--t3)" }}
      />
      <span className="flex-1 truncate" style={{ fontSize: "0.8125rem" }}>
        {item.label}
      </span>
      {item.badge && (
        <span className="badge badge-violet" style={{ fontSize: "0.5rem", padding: "1px 5px" }}>
          {item.badge}
        </span>
      )}
    </Link>
  );
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { t } = useI18n();

  const plan     = user?.subscription?.plan ?? "free";
  const initials = user?.email ? user.email[0].toUpperCase() : "?";

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setSearchOpen(o => !o); }
      if (e.key === "Escape") { setSearchOpen(false); setSearchQuery(""); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const MAIN_NAV: NavItem[] = [
    { href: "/dashboard",   label: t.nav.dashboard, icon: LayoutDashboard, section: t.sections.overview },
    { href: "/screener",    label: t.nav.screener,  icon: Filter,          section: t.sections.research },
    { href: "/scorer",      label: t.nav.scorer,    icon: Star },
    { href: "/predictions", label: t.nav.mlAlpha,   icon: Brain,           badge: "AI" },
    { href: "/portfolio",   label: t.nav.portfolio,  icon: Briefcase,      section: t.sections.capital },
    { href: "/tracker",     label: t.nav.tracker,   icon: Wallet },
    { href: "/equity",      label: t.nav.equity,    icon: TrendingUp,      section: t.sections.deepDive },
    { href: "/reporting",   label: t.nav.reporting, icon: FileText },
    { href: "/docs",        label: t.nav.docs,      icon: BookOpen },
  ];

  const BOTTOM_NAV: NavItem[] = [
    { href: "/settings", label: t.nav.settings, icon: Settings },
    { href: "/account",  label: t.nav.account,  icon: UserCircle },
  ];

  const ALL_NAV = [...MAIN_NAV, ...BOTTOM_NAV];
  const filteredNav = searchQuery.trim()
    ? ALL_NAV.filter(i => i.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : ALL_NAV;

  return (
    <>
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex flex-col transition-transform duration-200 ease-in-out",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}
      style={{
        width: 224,
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-4 flex-shrink-0"
        style={{ height: 52, borderBottom: "1px solid var(--border)" }}
      >
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: 28, height: 28,
            background: "var(--orange-dim)",
            border: "1px solid var(--orange-border)",
            borderRadius: "var(--r-sm)",
          }}
        >
          <Activity size={14} style={{ color: "var(--orange)" }} />
        </div>
        <div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.82rem",
            fontWeight: 700,
            letterSpacing: "0.04em",
            color: "var(--t1)",
            lineHeight: 1,
          }}>
            CAPITALIS
          </div>
          <div style={{
            fontSize: "0.57rem",
            color: "var(--t3)",
            letterSpacing: "0.10em",
            marginTop: 3,
          }}>
            {t.sidebar.tagline}
          </div>
        </div>
      </div>

      {/* Search */}
      <div
        className="px-3 py-2.5 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <button
          onClick={() => setSearchOpen(true)}
          className="w-full flex items-center gap-2 px-3"
          style={{
            height: 32,
            background: "var(--bg-base)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-sm)",
            cursor: "text",
          }}
        >
          <Search size={12} style={{ color: "var(--t3)", flexShrink: 0 }} />
          <span style={{ fontSize: "0.75rem", color: "var(--t3)" }}>{t.sidebar.search}</span>
          <span
            className="ml-auto"
            style={{
              fontSize: "0.57rem",
              color: "var(--t3)",
              fontFamily: "'JetBrains Mono', monospace",
              background: "var(--bg-hover)",
              border: "1px solid var(--border)",
              borderRadius: "3px",
              padding: "1px 4px",
            }}
          >
            ⌘K
          </span>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {MAIN_NAV.map(item => (
          <div key={item.href}>
            {item.section && (
              <p className="section-label px-3 mb-2 mt-3">{item.section}</p>
            )}
            <NavLink
              item={item}
              active={pathname === item.href || pathname.startsWith(item.href + "/")}
              onClose={onClose}
            />
          </div>
        ))}
      </nav>

      {/* Bottom nav */}
      <div
        className="px-2 pb-2 pt-2 space-y-0.5"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        {BOTTOM_NAV.map(item => (
          <NavLink
            key={item.href}
            item={item}
            active={pathname === item.href || pathname.startsWith(item.href + "/")}
            onClose={onClose}
          />
        ))}
      </div>

      {/* User */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <div
          className="flex items-center justify-center font-bold flex-shrink-0"
          style={{
            width: 30, height: 30,
            background: "var(--orange-dim)",
            border: "1px solid var(--orange-border)",
            borderRadius: "var(--r-sm)",
            color: "var(--orange)",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.78rem",
          }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="font-medium truncate leading-tight"
            style={{ color: "var(--t1)", fontSize: "0.75rem" }}
          >
            {user?.email ?? ""}
          </div>
          <span className={cn("badge mt-1", plan === "institutional" ? "badge-green" : "badge-orange")}>
            {plan === "institutional" ? t.user.plan.institutional : t.user.plan.free}
          </span>
        </div>
        <button
          onClick={toggle}
          title={theme === "dark" ? "Switch to light" : "Switch to dark"}
          className="flex-shrink-0 p-1.5 transition-colors"
          style={{ color: "var(--t3)", borderRadius: "var(--r-sm)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--t1)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--t3)")}
        >
          {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
        </button>
        <button
          onClick={() => { logout(); router.replace("/login"); }}
          title={t.user.signOut}
          className="flex-shrink-0 p-1.5 transition-colors"
          style={{ color: "var(--t3)", borderRadius: "var(--r-sm)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--red)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--t3)")}
        >
          <LogOut size={13} />
        </button>
      </div>
    </aside>

    {/* Search modal */}
    {searchOpen && (
      <div
        className="fixed inset-0 z-50 flex items-start justify-center"
        style={{ background: "rgba(0,0,0,0.65)", paddingTop: "20vh" }}
        onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
      >
        <div
          style={{
            width: 440,
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-sm)",
            overflow: "hidden",
            boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          }}
          onClick={e => e.stopPropagation()}
        >
          <div
            className="flex items-center gap-2 px-3"
            style={{ height: 44, borderBottom: "1px solid var(--border)" }}
          >
            <Search size={13} style={{ color: "var(--t3)", flexShrink: 0 }} />
            <input
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t.sidebar.search + "..."}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: "0.8125rem",
                color: "var(--t1)",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            />
            <span style={{
              fontSize: "0.55rem", color: "var(--t3)",
              fontFamily: "'JetBrains Mono', monospace",
              background: "var(--bg-hover)",
              border: "1px solid var(--border)",
              borderRadius: "3px",
              padding: "1px 5px",
            }}>ESC</span>
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {filteredNav.length === 0 ? (
              <div style={{ fontSize: "0.75rem", color: "var(--t3)", padding: "10px 14px" }}>
                No results
              </div>
            ) : filteredNav.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.href}
                  onClick={() => { router.push(item.href); setSearchOpen(false); setSearchQuery(""); onClose(); }}
                  className="w-full flex items-center gap-3 text-left"
                  style={{ padding: "8px 14px", fontSize: "0.8125rem", color: "var(--t2)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}
                >
                  <Icon size={13} style={{ color: "var(--t3)", flexShrink: 0 }} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
