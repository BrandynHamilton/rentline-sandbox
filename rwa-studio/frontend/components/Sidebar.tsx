"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Layers,
  Wallet,
  FlaskConical,
  FlaskRound,
  LogOut,
} from "lucide-react";
import { useClerk } from "@clerk/nextjs";
import WalletButton from "@/components/WalletButton";

const navItems = [
  { label: "Dashboard",  icon: LayoutDashboard, href: "/" },
  { label: "Properties", icon: Building2,       href: "/properties" },
  { label: "Portfolios", icon: Layers,          href: "/portfolios" },
  { label: "My Wallet",  icon: Wallet,          href: "/wallet",      exact: true },
  { label: "Sandbox",     icon: FlaskConical,    href: "/wallet/studio" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { signOut, user } = useClerk();

  return (
    <aside className="fixed inset-y-0 left-0 w-[216px] flex flex-col bg-[var(--sidebar)] border-r border-[var(--sidebar-border)] z-50">
      {/* Logo + Wallet */}
      <div className="flex items-center gap-2 px-5 h-16 border-b border-[var(--sidebar-border)]">
        <div className="flex items-center gap-2.5 min-w-0 shrink-0">
          <div className="w-7 h-7 rounded-md bg-[var(--color-crimson)] flex items-center justify-center shrink-0">
            <FlaskRound className="w-4 h-4 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-[var(--color-text)] tracking-tight text-[15px] leading-tight">
              Rentline
            </span>
            <span className="text-[11px] text-[var(--color-text-muted)] leading-tight">
              Sandbox
            </span>
          </div>
        </div>
        <div className="flex-1" />
        <div className="shrink-0">
          <WalletButton compact />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ label, icon: Icon, href, exact }) => {
          const active = exact ? pathname === href : (href === "/" ? pathname === "/" : pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-[var(--sidebar-accent)] text-[var(--color-blue)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--color-text)]"
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  active ? "text-[var(--color-blue)]" : "text-[var(--color-text-muted)]"
                }`}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Sign Out */}
      <div className="border-t border-[var(--sidebar-border)] p-3 space-y-1">
        <div className="px-3 text-xs text-[var(--color-text-muted)] truncate">
          {user?.primaryEmailAddress?.emailAddress ?? user?.fullName ?? "Signed in"}
        </div>
        <button
          onClick={() => signOut({ redirectUrl: "/" })}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-[var(--color-text-secondary)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--color-text)]"
        >
          <LogOut className="w-4 h-4 shrink-0 text-[var(--color-text-muted)]" />
          Sign Out
        </button>
      </div>

    </aside>
  );
}
