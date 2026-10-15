"use client";

import clsx from "clsx";
import { Briefcase, CreditCard, FileSignature, LayoutDashboard, LogOut, MoreHorizontal, Settings, Store, Tags, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { LiveEvents } from "./LiveEvents";
import { NotificationBell } from "./NotificationBell";
import { useAuth } from "@/lib/auth";
import type { Permission } from "@roofdesk/shared";

// `primary` items sit in the phone's bottom bar; the rest live under "More" so nothing is squeezed.
const NAV: { href: string; label: string; short?: string; icon: LucideIcon; primary?: boolean; permission?: Permission }[] = [
  { href: "/dashboard", label: "Dashboard", short: "Home", icon: LayoutDashboard, primary: true },
  { href: "/jobs", label: "Jobs", icon: Briefcase, primary: true },
  { href: "/payments", label: "Payments", icon: CreditCard, primary: true, permission: "payment:request" },
  { href: "/suppliers", label: "Suppliers", icon: Store, permission: "order:send" },
  { href: "/prices", label: "Price list", icon: Tags, permission: "estimate:write" },
  { href: "/waivers", label: "Waiver forms", icon: FileSignature, permission: "user:manage" },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/team", label: "Operations Interns", icon: Users, permission: "user:manage" },
];

export function Shell({ children }: { children: ReactNode }) {
  const { user, status, logout, can } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (status === "anon") router.replace("/login");
  }, [status, router]);
  useEffect(() => setMore(false), [pathname]);

  if (status !== "authed" || !user) {
    return <div className="grid min-h-screen place-items-center text-mist">Loading your workspace</div>;
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const availableNav = NAV.filter((n) => !n.permission || can(n.permission));
  const primary = availableNav.filter((n) => n.primary);
  const secondary = availableNav.filter((n) => !n.primary);
  const moreActive = secondary.some((n) => isActive(n.href));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr] print:block">
      <LiveEvents />
      <aside className="hidden border-r border-ink-600 bg-ink-950 p-5 print:hidden lg:flex lg:flex-col">
        <div className="flex items-center justify-between"><Logo href="/dashboard" /><NotificationBell /></div>
        <nav className="mt-8 flex-1 space-y-1" aria-label="Portal">
          {availableNav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}
              className={clsx("flex min-h-[44px] items-center gap-3 rounded-md px-3 text-sm font-medium", isActive(href) ? "bg-ember/15 text-ember" : "text-mist-strong hover:bg-ink-700")}>
              <Icon size={18} aria-hidden /> {user.role === "operations" && href === "/dashboard" ? "My work" : label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-ink-600 pt-4 text-sm">
          <p className="font-medium">{user.name}</p>
          <p className="text-mist">{user.company.name} | {user.role}</p>
          <button onClick={logout} className="mt-3 flex min-h-[44px] items-center gap-2 text-mist-strong hover:text-white"><LogOut size={16} aria-hidden /> Sign out</button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
        <header className="flex items-center justify-between border-b border-ink-600 px-5 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] print:hidden lg:hidden">
          <Logo href="/dashboard" />
          <NotificationBell align="right" />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-5 lg:p-8">{children}</main>
      </div>

      {/* phone: the "More" sheet and bottom bar */}
      {more && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 border-t border-ink-600 bg-ink-900 p-3 shadow-2xl print:hidden lg:hidden">
          <nav aria-label="More" className="grid gap-1">
            {secondary.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}
                className={clsx("flex min-h-[48px] items-center gap-3 rounded-md px-3 text-sm font-medium", isActive(href) ? "bg-ember/15 text-ember" : "text-mist-strong")}>
                <Icon size={18} aria-hidden /> {label}
              </Link>
            ))}
            <button onClick={logout} className="flex min-h-[48px] items-center gap-3 rounded-md px-3 text-sm font-medium text-mist-strong"><LogOut size={18} aria-hidden /> Sign out ({user.name.split(" ")[0]})</button>
          </nav>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-ink-600 bg-ink-950 pb-[env(safe-area-inset-bottom)] print:hidden lg:hidden" aria-label="Portal">
        {primary.map(({ href, label, short, icon: Icon }) => (
          <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}
            className={clsx("flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", isActive(href) ? "text-ember" : "text-mist-strong")}>
            <Icon size={20} aria-hidden /> {short ?? label}
          </Link>
        ))}
        <button aria-expanded={more} onClick={() => setMore((m) => !m)}
          className={clsx("flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", more || moreActive ? "text-ember" : "text-mist-strong")}>
          <MoreHorizontal size={20} aria-hidden /> More
        </button>
      </nav>
    </div>
  );
}
