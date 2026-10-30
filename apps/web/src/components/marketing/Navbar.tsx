"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/Logo";

const LINKS = [
  { href: "#services", label: "Services" },
  { href: "#workflow", label: "Workflow" },
  { href: "#waivers", label: "Waivers" },
  { href: "#contact", label: "Contact" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-900/85 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
        <Logo />
        <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-sm font-medium text-mist-strong hover:text-white">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="btn btn-ghost hidden sm:inline-flex">Sign in</Link>
          <Link href="/register" className="btn btn-primary">Start free trial</Link>
          <button className="btn btn-ghost px-3 md:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menu">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-white/5 px-5 pb-4 md:hidden" aria-label="Mobile">
          {[...LINKS, { href: "/login", label: "Sign in" }].map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block py-3 text-mist-strong">
              {l.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
