"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { MARKER_LABELS, type DocumentDTO, type Marker } from "@roofdesk/shared";
import { fetchBlob } from "@/lib/api";

const cache = new Map<string, string>(); // blob URL by path, for the life of the page

/** Loads a protected image with the user's token and shows it. Optionally draws numbered damage markers on top. */
export function AuthImage({ doc, className, markers = false, onClickAt, alt }: { doc: DocumentDTO; className?: string; markers?: boolean | Marker[]; onClickAt?: (x: number, y: number) => void; alt?: string }) {
  const path = `/jobs/${doc.jobId}/documents/${doc.id}/file`;
  const [src, setSrc] = useState<string | null>(cache.get(path) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (cache.has(path)) return setSrc(cache.get(path)!);
    let live = true;
    fetchBlob(path).then((b) => { const u = URL.createObjectURL(b); cache.set(path, u); if (live) setSrc(u); }).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [path]);

  const list = Array.isArray(markers) ? markers : markers ? doc.annotations : [];
  if (failed) return <div className={clsx("grid place-items-center bg-ink-700 p-3 text-center text-xs text-mist", className)}>Preview not available</div>;
  if (!src) return <div className={clsx("animate-pulse bg-ink-700", className)} aria-label="Loading picture" />;

  return (
    <div className={clsx("relative", onClickAt && "cursor-crosshair")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt ?? doc.caption ?? doc.filename}
        className={className}
        onError={() => setFailed(true)}
        onClick={onClickAt ? (e) => { const r = e.currentTarget.getBoundingClientRect(); onClickAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); } : undefined}
      />
      {list.map((m, i) => (
        <span key={m.id} title={`${MARKER_LABELS[m.kind]}${m.note ? `: ${m.note}` : ""}`} aria-label={`Marker ${i + 1}: ${MARKER_LABELS[m.kind]}`}
          className="pointer-events-none absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-ember text-xs font-bold text-white shadow"
          style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}>{i + 1}</span>
      ))}
    </div>
  );
}
