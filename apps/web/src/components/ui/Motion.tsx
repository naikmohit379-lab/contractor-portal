"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export function Reveal({
  children,
  className,
  delay = 0,
  label,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  label?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      aria-label={label}
      initial={reduceMotion ? false : { opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 82, damping: 19, mass: 0.85, delay }}
    >
      {children}
    </motion.div>
  );
}

export function InteractiveCard({
  children,
  className,
  delay = 0,
  label,
  role,
  tabIndex,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  label?: string;
  role?: "complementary" | "region";
  tabIndex?: number;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      role={role ?? (label ? "complementary" : undefined)}
      aria-label={label}
      tabIndex={tabIndex}
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      whileHover={reduceMotion ? undefined : { y: -6, scale: 1.015 }}
      whileTap={reduceMotion ? undefined : { scale: 0.985 }}
      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 280, damping: 22, mass: 0.7, delay }}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedListItem({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.li
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      whileHover={reduceMotion ? undefined : { x: 4 }}
      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 180, damping: 20, delay }}
    >
      {children}
    </motion.li>
  );
}

export function Floating({ children, className }: { children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      animate={reduceMotion ? undefined : { y: [0, -7, 0], rotateZ: [0, 0.2, 0] }}
      transition={reduceMotion ? undefined : { duration: 7, ease: "easeInOut", repeat: Infinity }}
    >
      {children}
    </motion.div>
  );
}

export function AmbientGlow({ className }: { className: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      aria-hidden="true"
      className={className}
      animate={reduceMotion ? undefined : { x: [0, 22, 0], y: [0, -12, 0], scale: [1, 1.08, 1], opacity: [0.35, 0.6, 0.35] }}
      transition={reduceMotion ? undefined : { duration: 12, ease: "easeInOut", repeat: Infinity }}
    />
  );
}
