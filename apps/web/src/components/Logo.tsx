import Link from "next/link";
import { BRAND } from "@/lib/brand";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2" aria-label={`${BRAND.name} home`}>
      <svg width="34" height="34" viewBox="0 0 64 64" fill="none" aria-hidden>
        <polygon points="4,31 27,8 43,24 20,47 7,35" fill="#2875df" />
        <polygon points="27,8 34,1 41,1 57,17 42,32" fill="#183b72" />
        <polygon points="43,25 61,43 61,48 55,54 49,54 32,37" fill="#27c6a1" />
        <polygon points="18,56 32,42 46,56" fill="#55d9b9" />
      </svg>
      <span className="font-display text-xl font-bold uppercase tracking-wide">{BRAND.name}</span>
    </Link>
  );
}
