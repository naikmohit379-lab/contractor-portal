import Link from "next/link";
import { BRAND } from "@/lib/brand";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2" aria-label={`${BRAND.name} home`}>
      <svg width="34" height="26" viewBox="0 0 34 26" fill="none" aria-hidden>
        <path d="M2 24 17 4l15 20" stroke="#ff6a00" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
        <path d="M9 24 17 13l8 11" stroke="#fff" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <span className="font-display text-xl font-bold uppercase tracking-wide">{BRAND.name}</span>
    </Link>
  );
}
