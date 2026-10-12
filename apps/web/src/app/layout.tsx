import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import type { ReactNode } from "react";
import { BRAND } from "@/lib/brand";
import { Providers } from "./providers";
import "./globals.css";

const display = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" });
const body = Barlow({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });

const productionDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? (productionDomain ? `https://${productionDomain}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${BRAND.name} | Roofing contractor portal`, template: `%s | ${BRAND.name}` },
  description:
    "Order aerial roof measurements, build insurance claim estimates, coordinate supplier orders and track lien waivers in one job record.",
  openGraph: { type: "website", siteName: BRAND.name, title: `${BRAND.name} | ${BRAND.tagline}` },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0e131a", viewportFit: "cover" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
