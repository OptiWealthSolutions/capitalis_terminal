"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Wallet, UserCircle, TrendingUp, Network,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface NavItem { href: string; label: string; icon: React.ElementType; }

export default function BottomNav() {
  const pathname = usePathname();
  const { t }    = useI18n();

  const PRIMARY: NavItem[] = [
    { href: "/dashboard",   label: t.nav.dashboard, icon: LayoutDashboard },
    { href: "/tracker",     label: t.nav.tracker,   icon: Wallet          },
    { href: "/equity",      label: t.nav.equity,    icon: TrendingUp      },
    { href: "/value-chain", label: "Market Map",    icon: Network         },
    { href: "/account",     label: t.nav.account,   icon: UserCircle      },
  ];

  return (
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
              style={{ color: active ? "var(--orange)" : "var(--t3)" }}
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
      </div>
    </nav>
  );
}
