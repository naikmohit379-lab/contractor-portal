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
      transition={{ duration: reduceMotion ? 0 : 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
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
      transition={{ duration: reduceMotion ? 0 : 0.35, delay, ease: [0.22, 1, 0.36, 1] }}
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
      transition={{ duration: reduceMotion ? 0 : 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.li>
  );
}
