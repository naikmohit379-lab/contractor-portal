"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Logo } from "@/components/Logo";

const LINKS = [
  { href: "#modules", label: "Modules" },
  { href: "#workflow", label: "Workflow" },
  { href: "#waivers", label: "Waivers" },
  { href: "#contact", label: "Contact" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-900/45 pt-[env(safe-area-inset-top)] shadow-sm backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
        <Logo />
        <nav className="hidden items-center gap-1 rounded-full bg-white/95 p-1.5 shadow-xl shadow-ink-950/10 md:flex" aria-label="Main">
          {LINKS.map((l) => (
            <motion.a key={l.href} href={l.href} onHoverStart={() => setHovered(l.href)} onHoverEnd={() => setHovered(null)}
              className={`relative rounded-full px-4 py-2 text-sm font-medium transition-colors ${hovered === l.href ? "text-white" : "text-ink-900"}`}>
              {hovered === l.href && !reduceMotion && <motion.span layoutId="marketing-nav-pill" className="absolute inset-0 -z-0 rounded-full bg-ember" transition={{ type: "spring", stiffness: 360, damping: 28, mass: 0.65 }} />}
              <span className="relative z-10">{l.label}</span>
            </motion.a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="btn btn-ghost hidden sm:inline-flex">Sign in</Link>
          <Link href="/register" className="btn btn-primary">Start free trial</Link>
          <motion.button whileHover={reduceMotion ? undefined : { rotate: open ? -4 : 4 }} whileTap={reduceMotion ? undefined : { scale: 0.9 }} className="btn btn-ghost px-3 md:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menu">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={open ? "close" : "menu"} initial={reduceMotion ? false : { opacity: 0, rotate: -45, scale: 0.7 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} exit={reduceMotion ? undefined : { opacity: 0, rotate: 45, scale: 0.7 }} transition={{ duration: reduceMotion ? 0 : 0.16 }}>
                {open ? <X size={20} /> : <Menu size={20} />}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.nav initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 220, damping: 25 }} className="overflow-hidden border-t border-white/10 bg-ink-900/95 px-5 pb-4 md:hidden" aria-label="Mobile">
            {[...LINKS, { href: "/login", label: "Sign in" }].map((l, index) => (
              <motion.a key={l.href} href={l.href} onClick={() => setOpen(false)} initial={reduceMotion ? false : { x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: reduceMotion ? 0 : index * 0.035 }} className="block py-3 text-mist-strong">
                {l.label}
              </motion.a>
            ))}
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
