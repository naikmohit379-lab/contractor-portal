import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Shell } from "@/components/portal/Shell";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function PortalLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
