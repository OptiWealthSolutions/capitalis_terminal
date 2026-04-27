"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, Filter, TrendingUp, Briefcase,
  MoreHorizontal, Star, Network, Wallet, Bell,
  FileText, BookOpen, Settings, UserCircle, X, Users, Search,
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
    { href: "/screener",  label: t.nav.screener,  icon: Search          },
    { href: "/portfolio", label: t.nav.portfolio, icon: Briefcase       },
    { href: "/equity",    label: t.nav.equity,    icon: TrendingUp      },
  ];

  const MORE: NavItem[] = [
    { href: "/scorer",      label: t.nav.scorer,     icon: Star       },
    { href: "/value-chain", label: t.nav.valueChain, icon: Network    },
    { href: "/tracker",     label: t.nav.tracker,    icon: Wallet     },
    { href: "/alerts",      label: t.nav.alerts,     icon: Bell       },
    { href: "/community",   label: t.nav.community,  icon: Users      },
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
      {/* Floating bottom nav — Instagram-style icon-only with active dot */}
      <nav
        className="fixed bottom-0 inset-x-0 z-40 md:hidden"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          background: "var(--bg-surface)",
          borderTop: "1px solid var(--border)",
          backdropFilter: "saturate(140%) blur(8px)",
          WebkitBackdropFilter: "saturate(140%) blur(8px)",
        }}
      >
        <div className="flex items-stretch justify-around" style={{ height: 56 }}>
          {PRIMARY.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon   = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className="relative flex-1 flex items-center justify-center"
                style={{ color: active ? "var(--t1)" : "var(--t3)" }}
              >
                <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
                {active && (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute", bottom: 6,
                      width: 4, height: 4, borderRadius: "50%",
                      background: "var(--orange)",
                    }}
                  />
                )}
              </Link>
            );
          })}

          {/* More button */}
          <button
            aria-label="More"
            className="relative flex-1 flex items-center justify-center"
            style={{ color: isMoreActive || sheetOpen ? "var(--t1)" : "var(--t3)" }}
            onClick={() => setSheetOpen(true)}
          >
            <MoreHorizontal size={22} strokeWidth={isMoreActive ? 2.4 : 1.8} />
            {(isMoreActive || sheetOpen) && (
              <span aria-hidden style={{
                position: "absolute", bottom: 6,
                width: 4, height: 4, borderRadius: "50%",
                background: "var(--orange)",
              }} />
            )}
          </button>
        </div>
      </nav>

      {/* Sheet backdrop */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          style={{ background: "rgba(0,0,0,0.55)", animation: "fadeUp 0.18s ease-out" }}
          onClick={() => setSheetOpen(false)}
        />
      )}

      {/* Sheet panel — slides up */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 md:hidden transition-transform"
        style={{
          background: "var(--bg-card)",
          borderTop: "1px solid var(--border)",
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          transform: sheetOpen ? "translateY(0)" : "translateY(100%)",
          transitionDuration: "0.24s",
          transitionTimingFunction: "cubic-bezier(.32,.72,.0,1)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)",
          boxShadow: "0 -24px 60px rgba(0,0,0,0.45)",
        }}
        role="dialog"
        aria-hidden={!sheetOpen}
      >
        {/* Drag handle */}
        <div className="flex items-center justify-center pt-3 pb-2">
          <div style={{ width: 38, height: 4, borderRadius: 999, background: "var(--border-hi)" }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3">
          <span style={{
            fontSize: "0.66rem", fontWeight: 700, letterSpacing: "0.08em",
            textTransform: "uppercase", color: "var(--t3)",
          }}>
            More
          </span>
          <button
            onClick={() => setSheetOpen(false)}
            aria-label="Close"
            className="flex items-center justify-center"
            style={{
              width: 30, height: 30, borderRadius: "50%",
              background: "var(--bg-hover)", color: "var(--t2)",
              border: "1px solid var(--border)",
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 px-4 pb-3 pt-1">
          {MORE.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon   = item.icon;
            return (
              <button
                key={item.href}
                onClick={() => goMore(item.href)}
                className="flex flex-col items-center justify-center gap-2 py-4 transition-all"
                style={{
                  background: active ? "var(--orange-dim)" : "var(--bg-inner)",
                  border: `1px solid ${active ? "var(--orange-border)" : "var(--border)"}`,
                  borderRadius: 14,
                  color: active ? "var(--orange)" : "var(--t1)",
                }}
              >
                <Icon size={20} strokeWidth={active ? 2.2 : 1.7} />
                <span style={{
                  fontSize: "0.66rem", fontWeight: 600, letterSpacing: "0.02em",
                  textAlign: "center", lineHeight: 1.1,
                  textTransform: "none",
                }}>
                  {item.label.length > 14 ? item.label.slice(0, 13) + "…" : item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
