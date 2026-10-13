"use client";

import clsx from "clsx";
import { Briefcase, CreditCard, FileSignature, LayoutDashboard, LogOut, Settings, Store } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Logo } from "@/components/Logo";
import { LiveEvents } from "./LiveEvents";
import { NotificationBell } from "./NotificationBell";
import { useAuth } from "@/lib/auth";

const NAV = [
  { href: "/dashboard", label: "Dashboard", short: "Home", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/suppliers", label: "Suppliers", icon: Store },
  { href: "/waivers", label: "Waiver forms", short: "Forms", icon: FileSignature },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Shell({ children }: { children: ReactNode }) {
  const { user, status, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (status === "anon") router.replace("/login");
  }, [status, router]);

  if (status !== "authed" || !user) {
    return <div className="grid min-h-screen place-items-center text-mist">Loading your workspace</div>;
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr] print:block">
      <LiveEvents />
      <aside className="hidden print:hidden border-r border-ink-600 bg-ink-950 p-5 lg:flex lg:flex-col">
        <div className="flex items-center justify-between"><Logo href="/dashboard" /><NotificationBell /></div>
        <nav className="mt-8 flex-1 space-y-1" aria-label="Portal">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}
              className={clsx("relative flex min-h-[44px] items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors", isActive(href) ? "text-ember" : "text-mist-strong hover:bg-ink-700")}>
              {isActive(href) && <motion.span layoutId="portal-desktop-active" className="absolute inset-0 -z-0 rounded-md bg-ember/15" transition={{ type: "spring", stiffness: 420, damping: 35 }} />}
              <motion.span className="relative z-10 flex items-center gap-3" whileHover={reduceMotion ? undefined : { x: 3 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}><Icon size={18} aria-hidden /> {label}</motion.span>
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
        <header className="flex items-center justify-between print:hidden border-b border-ink-600 px-5 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] lg:hidden">
          <Logo href="/dashboard" />
          <div className="flex items-center gap-2"><NotificationBell align="right" /><button onClick={logout} className="btn btn-ghost px-3" aria-label="Sign out"><LogOut size={18} /></button></div>
        </header>
        <motion.main key={pathname} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.24, ease: "easeOut" }} className="mx-auto w-full max-w-6xl flex-1 p-5 lg:p-8">{children}</motion.main>
      </div>

      {/* mobile bottom navigation */}
      <nav className="fixed print:hidden inset-x-0 bottom-0 z-30 flex border-t border-ink-600 bg-ink-950 pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Portal">
        {NAV.map(({ href, label, short, icon: Icon }) => (
          <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}
            className={clsx("relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", isActive(href) ? "text-ember" : "text-mist-strong")}>
            {isActive(href) && <motion.span layoutId="portal-mobile-active" className="absolute inset-x-1 inset-y-1 -z-0 rounded-lg bg-ember/10" transition={{ type: "spring", stiffness: 420, damping: 35 }} />}
            <motion.span className="relative z-10 flex flex-col items-center gap-0.5" whileTap={reduceMotion ? undefined : { scale: 0.92 }}><Icon size={20} aria-hidden /> {short ?? label}</motion.span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
