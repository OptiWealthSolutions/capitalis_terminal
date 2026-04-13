"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BarChart2,
  Brain,
  Filter,
  Star,
  Briefcase,
  TrendingUp,
  FileText,
  Settings,
  Activity,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/macro",       label: "MACRO VIEW",    icon: <BarChart2 size={15} />,  shortcut: "Alt+1" },
  { href: "/predictions", label: "ML ALPHA",      icon: <Brain size={15} />,      shortcut: "Alt+2" },
  { href: "/screener",    label: "SCREENER",      icon: <Filter size={15} />,     shortcut: "Alt+3" },
  { href: "/scorer",      label: "SCORER",        icon: <Star size={15} />,       shortcut: "Alt+4" },
  { href: "/portfolio",   label: "PORTFOLIO",     icon: <Briefcase size={15} />,  shortcut: "Alt+5" },
  { href: "/equity",      label: "EQUITY OV.",    icon: <TrendingUp size={15} />, shortcut: "Alt+6" },
  { href: "/reporting",   label: "REPORTING",     icon: <FileText size={15} />,   shortcut: "Alt+7" },
  { href: "/settings",    label: "SETTINGS",      icon: <Settings size={15} />,   shortcut: "Alt+8" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-48 bg-bg-secondary border-r border-bg-border flex flex-col z-40">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-bg-border">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-accent-blue" />
          <span className="text-text-primary font-semibold text-sm tracking-widest">
            CAPITALIS
          </span>
        </div>
        <div className="text-text-muted text-xs mt-0.5">V2 TERMINAL</div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 text-xs font-medium transition-colors duration-100",
                "hover:bg-bg-tertiary hover:text-text-primary",
                isActive
                  ? "bg-bg-tertiary text-accent-blue border-l-2 border-accent-blue"
                  : "text-text-secondary border-l-2 border-transparent"
              )}
              title={item.shortcut}
            >
              <span className={cn(isActive ? "text-accent-blue" : "text-text-secondary")}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-bg-border">
        <div className="text-xs text-text-muted">
          <div>CAPITALIS V2</div>
          <div className="text-xs opacity-50">build 2.0.0</div>
        </div>
      </div>
    </aside>
  );
}
