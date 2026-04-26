"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, Filter, TrendingUp, Briefcase,
  MoreHorizontal, Star, Network, Wallet, Bell,
  FileText, BookOpen, Settings, UserCircle, X,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface NavItem { href: string; label: string; icon: React.ElementType; }

export default function BottomNav() {
  const pathname = usePathname();
  const router   = useRouter();
  const { t }    = useI18n();
  const [sheetOpen, setSheetOpen] = useState(false);

  const PRIMARY: NavItem[] = [
    { href: "/dashboard", label: t.nav.dashboard, icon: LayoutDashboard },
    { href: "/screener",  label: t.nav.screener,  icon: Filter           },
    { href: "/equity",    label: t.nav.equity,    icon: TrendingUp       },
    { href: "/portfolio", label: t.nav.portfolio, icon: Briefcase        },
  ];

  const MORE: NavItem[] = [
    { href: "/scorer",      label: t.nav.scorer,     icon: Star       },
    { href: "/value-chain", label: t.nav.valueChain, icon: Network    },
    { href: "/tracker",     label: t.nav.tracker,    icon: Wallet     },
    { href: "/alerts",      label: t.nav.alerts,     icon: Bell       },
    { href: "/reporting",   label: t.nav.reporting,  icon: FileText   },
    { href: "/docs",        label: t.nav.docs,       icon: BookOpen   },
    { href: "/settings",    label: t.nav.settings,   icon: Settings   },
    { href: "/account",     label: t.nav.account,    icon: UserCircle },
  ];

  const isMoreActive = MORE.some(i => pathname === i.href || pathname.startsWith(i.href + "/"));

  function goMore(href: string) {
    setSheetOpen(false);
    router.push(href);
  }

  return (
    <>
      {/* Bottom nav bar */}
      <nav
        className="fixed bottom-0 inset-x-0 z-40 md:hidden flex items-stretch"
        style={{
          height: 56,
          background: "var(--bg-surface)",
          borderTop: "1px solid var(--border)",
        }}
      >
        {PRIMARY.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon   = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
              style={{ color: active ? "var(--orange)" : "var(--t3)" }}
            >
              <Icon size={18} />
              <span style={{ fontSize: "0.55rem", fontWeight: 600, letterSpacing: "0.06em", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>
                {item.label.length > 8 ? item.label.slice(0, 7) + "…" : item.label}
              </span>
            </Link>
          );
        })}

        {/* More button */}
        <button
          className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
          style={{ color: isMoreActive ? "var(--orange)" : "var(--t3)" }}
          onClick={() => setSheetOpen(true)}
        >
          <MoreHorizontal size={18} />
          <span style={{ fontSize: "0.55rem", fontWeight: 600, letterSpacing: "0.06em", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>MORE</span>
        </button>
      </nav>

      {/* Sheet backdrop */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setSheetOpen(false)}
        />
      )}

      {/* Sheet panel — slides up */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 md:hidden transition-transform duration-200"
        style={{
          background: "var(--bg-surface)",
          borderTop: "1px solid var(--border)",
          borderRadius: "16px 16px 0 0",
          transform: sheetOpen ? "translateY(0)" : "translateY(100%)",
          paddingBottom: "env(safe-area-inset-bottom, 16px)",
        }}
      >
        {/* Handle + close */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border-hi)", margin: "0 auto" }} />
          <button
            onClick={() => setSheetOpen(false)}
            className="absolute right-4 top-3 flex items-center justify-center"
            style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--bg-hover)", color: "var(--t3)" }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-1 px-3 pb-4 pt-2">
          {MORE.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon   = item.icon;
            return (
              <button
                key={item.href}
                onClick={() => goMore(item.href)}
                className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl transition-colors"
                style={{
                  background: active ? "var(--orange-dim)" : "var(--bg-card)",
                  border: `1px solid ${active ? "var(--orange-border)" : "var(--border)"}`,
                  color: active ? "var(--orange)" : "var(--t2)",
                }}
              >
                <Icon size={18} />
                <span style={{ fontSize: "0.54rem", fontWeight: 600, letterSpacing: "0.05em", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1, textAlign: "center" }}>
                  {item.label.length > 9 ? item.label.slice(0, 8) + "…" : item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
