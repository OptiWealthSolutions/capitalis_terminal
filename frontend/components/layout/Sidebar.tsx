"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  BarChart2, Brain, Filter, Star, Briefcase,
  TrendingUp, FileText, Settings, UserCircle, LogOut, Activity, BookOpen,
  Landmark, CalendarDays, Search,
  type LucideProps,
} from "lucide-react";
import type { ForwardRefExoticComponent, RefAttributes } from "react";

type LucideIcon = ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>>;
interface NavItem { href: string; label: string; icon: LucideIcon; badge?: string; }

const MAIN_NAV: NavItem[] = [
  { href: "/macro",       label: "Macro View",  icon: BarChart2 },
  { href: "/forex",       label: "Forex",       icon: Landmark },
  { href: "/predictions", label: "ML Alpha",    icon: Brain,      badge: "AI" },
  { href: "/screener",    label: "Screener",    icon: Filter },
  { href: "/scorer",      label: "Scorer",      icon: Star },
  { href: "/portfolio",   label: "Portfolio",   icon: Briefcase },
  { href: "/calendar",    label: "Calendar",    icon: CalendarDays },
  { href: "/equity",      label: "Equity",      icon: TrendingUp },
  { href: "/reporting",   label: "Reporting",   icon: FileText },
  { href: "/docs",        label: "Docs",        icon: BookOpen },
];

const BOTTOM_NAV: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/account",  label: "Account",  icon: UserCircle },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
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

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, logout } = useAuth();

  const plan     = user?.subscription?.plan ?? "free";
  const initials = user?.email ? user.email[0].toUpperCase() : "?";

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 flex flex-col"
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
            QUANT TERMINAL
          </div>
        </div>
      </div>

      {/* Search */}
      <div
        className="px-3 py-2.5 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div
          className="flex items-center gap-2 px-3"
          style={{
            height: 32,
            background: "var(--bg-base)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-sm)",
            cursor: "text",
          }}
        >
          <Search size={12} style={{ color: "var(--t3)", flexShrink: 0 }} />
          <span style={{ fontSize: "0.75rem", color: "var(--t3)" }}>Search</span>
          <span
            className="ml-auto"
            style={{
              fontSize: "0.57rem",
              color: "var(--t3)",
              fontFamily: "'JetBrains Mono', monospace",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--border)",
              borderRadius: "3px",
              padding: "1px 4px",
            }}
          >
            ⌘K
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        <p className="section-label px-3 mb-2 mt-0.5">Analytics</p>
        {MAIN_NAV.map(item => (
          <NavLink
            key={item.href}
            item={item}
            active={pathname === item.href || pathname.startsWith(item.href + "/")}
          />
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
            {plan}
          </span>
        </div>
        <button
          onClick={() => { logout(); router.replace("/login"); }}
          title="Sign out"
          className="flex-shrink-0 p-1.5 transition-colors"
          style={{ color: "var(--t3)", borderRadius: "var(--r-sm)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--red)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--t3)")}
        >
          <LogOut size={13} />
        </button>
      </div>
    </aside>
  );
}
