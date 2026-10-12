import type { Metadata } from "next";
import type { ReactNode } from "react";

// Token pages must never be indexed or leak the token through the referrer header.
export const metadata: Metadata = { title: "Confirm purchase order", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
