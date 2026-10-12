import type { Metadata } from "next";
import type { ReactNode } from "react";

// Signing links are credentials: never index them and never send them in a referrer header.
export const metadata: Metadata = { title: "Sign waiver", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
