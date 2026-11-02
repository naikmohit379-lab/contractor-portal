import Link from "next/link";
import { BRAND } from "@/lib/brand";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2" aria-label={`${BRAND.name} home`}>
      <svg width="34" height="34" viewBox="0 0 64 64" fill="none" aria-hidden>
        <path d="M4 34 27 11a6 6 0 0 1 8 0l8 8-31 31a5 5 0 0 1-7 0L4 42a6 6 0 0 1 0-8Z" fill="#2875df" />
        <path d="m27 11 8-8a6 6 0 0 1 8 0l9 9-17 17-17-17 1-1a6 6 0 0 1 8 0Z" fill="#183b72" />
        <path d="m35 19 17-17 9 9a6 6 0 0 1 0 8L39 41 35 37l-9 9 13 13a5 5 0 0 0 7 0l14-14a6 6 0 0 0 0-8L43 19l-8-8" fill="#27c6a1" />
        <path d="m20 53 12-12 12 12a2 2 0 0 1-1 3H21a2 2 0 0 1-1-3Z" fill="#55d9b9" />
      </svg>
      <span className="font-display text-xl font-bold uppercase tracking-wide">{BRAND.name}</span>
    </Link>
  );
}
