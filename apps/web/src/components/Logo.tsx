import Link from "next/link";
import { BRAND } from "@/lib/brand";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2" aria-label={`${BRAND.name} home`}>
      <svg width="34" height="34" viewBox="0 0 160 160" fill="none" aria-hidden>
        <path d="m8 88 47-48 25 25-48 46a8 8 0 0 1-11 0L9 99a8 8 0 0 1-1-11Z" fill="#2875df" />
        <path d="m55 40 18-18a9 9 0 0 1 13 0l16 18-22 23-25-23Z" fill="#183b72" />
        <path d="M102 40h24v34l22 14a8 8 0 0 1 1 12l-16 16a8 8 0 0 1-11 0L80 65l22-25Z" fill="#27c6a1" />
        <path d="m50 114 30-30 30 30H50Z" fill="#55d9b9" />
      </svg>
      <span className="font-display text-xl font-bold uppercase tracking-wide">{BRAND.name}</span>
    </Link>
  );
}
