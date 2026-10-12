import type { Metadata } from "next";
import type { ReactNode } from "react";

// Payment links are credentials: never index them, never leak them in a referrer header.
export const metadata: Metadata = { title: "Secure payment", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
