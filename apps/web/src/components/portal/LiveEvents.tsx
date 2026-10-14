"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { LiveEvent, NotificationDTO } from "@roofdesk/shared";
import { getAccessToken, refreshSession } from "@/lib/api";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

/**
 * Keeps one live connection to the API (Server-Sent Events read with fetch, so the Authorization header can be sent).
 * "invalidate" events refetch the affected data; "notification" events show a toast and refresh the bell.
 * It reconnects on its own. If it cannot connect, pages still refresh when you return to the tab.
 */
export function LiveEvents() {
  const qc = useQueryClient();
  const [toast, setToast] = useState<NotificationDTO | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let stop = false;
    let controller: AbortController | null = null;
    let failures = 0;

    const handle = (e: LiveEvent) => {
      if (e.type === "invalidate") e.keys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
      else {
        qc.invalidateQueries({ queryKey: ["notifications"] });
        setToast(e.notification);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setToast(null), 7000);
      }
    };

    async function connect() {
      while (!stop) {
        controller = new AbortController();
        try {
          let res = await fetch(`${BASE}/events`, { headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` }, credentials: "include", signal: controller.signal });
          if (res.status === 401 && (await refreshSession())) {
            res = await fetch(`${BASE}/events`, { headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` }, credentials: "include", signal: controller.signal });
          }
          if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
          failures = 0;

          const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
          let buffer = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break; // the server ends the stream every 10 minutes; we simply reconnect
            buffer += value;
            let i: number;
            while ((i = buffer.indexOf("\n\n")) >= 0) {
              const chunk = buffer.slice(0, i);
              buffer = buffer.slice(i + 2);
              const line = chunk.split("\n").find((l) => l.startsWith("data: "));
              if (line) {
                try { handle(JSON.parse(line.slice(6))); } catch { /* ignore a malformed message */ }
              }
            }
          }
        } catch {
          if (stop) return;
          failures += 1;
        }
        // Back off after failures (1s, 2s, 4s ... up to 30s) so a down server is not hammered.
        await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** Math.max(failures - 1, 0), 30_000)));
      }
    }
    connect();
    return () => { stop = true; controller?.abort(); clearTimeout(timer.current); };
  }, [qc]);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 lg:bottom-6 lg:justify-end print:hidden">
      {toast && (
        <div className="pointer-events-auto w-full max-w-sm rounded-lg border border-ember/50 bg-ink-800 p-4 shadow-2xl">
          <p className="font-semibold">{toast.title}</p>
          {toast.body && <p className="mt-1 text-sm text-mist-strong">{toast.body}</p>}
          <div className="mt-2 flex gap-4 text-sm">
            {toast.href && <Link href={toast.href} onClick={() => setToast(null)} className="font-semibold text-ember hover:underline">Open</Link>}
            <button onClick={() => setToast(null)} className="text-mist-strong hover:text-white">Dismiss</button>
          </div>
        </div>
      )}
    </div>
  );
}
