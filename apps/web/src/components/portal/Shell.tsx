"use client";

import clsx from "clsx";
import { Briefcase, CreditCard, FileSignature, LayoutDashboard, LogOut, Store } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/suppliers", label: "Suppliers", icon: Store },
  { href: "/waivers", label: "Waiver forms", icon: FileSignature },
  { href: "/payments", label: "Payments", icon: CreditCard },
];

export function Shell({ children }: { children: ReactNode }) {
  const { user, status, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status === "anon") router.replace("/login");
  }, [status, router]);

  if (status !== "authed" || !user) {
    return <div className="grid min-h-screen place-items-center text-mist">Loading your workspace</div>;
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr] print:block">
      <aside className="hidden print:hidden border-r border-ink-600 bg-ink-950 p-5 lg:flex lg:flex-col">
        <Logo href="/dashboard" />
        <nav className="mt-8 flex-1 space-y-1" aria-label="Portal">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}
              className={clsx("flex min-h-[44px] items-center gap-3 rounded-md px-3 text-sm font-medium", isActive(href) ? "bg-ember/15 text-ember" : "text-mist-strong hover:bg-ink-700")}>
              <Icon size={18} aria-hidden /> {label}
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
          <button onClick={logout} className="btn btn-ghost px-3" aria-label="Sign out"><LogOut size={18} /></button>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-5 lg:p-8">{children}</main>
      </div>

      {/* mobile bottom navigation */}
      <nav className="fixed print:hidden inset-x-0 bottom-0 z-30 flex border-t border-ink-600 bg-ink-950 pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Portal">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}
            className={clsx("flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-xs", isActive(href) ? "text-ember" : "text-mist-strong")}>
            <Icon size={20} aria-hidden /> {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
