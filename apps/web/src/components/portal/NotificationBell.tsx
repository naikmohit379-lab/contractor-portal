"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { NotificationDTO } from "@roofdesk/shared";
import { api, post } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";

export function NotificationBell({ align = "left" }: { align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => api<{ items: NotificationDTO[]; unreadCount: number }>("/notifications") });
  const read = useMutation({ mutationFn: (v: { ids?: string[]; all?: boolean }) => post("/notifications/read", v), onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) });

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const unread = q.data?.unreadCount ?? 0;
  return (
    <div className="relative" ref={ref}>
      <button className="btn btn-ghost relative px-3" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Bell size={18} aria-hidden />
        {unread > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-ember px-1 text-[11px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className={`absolute z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-ink-500 bg-ink-800 shadow-2xl ${align === "right" ? "right-0" : "left-0"}`}>
          <div className="flex items-center justify-between border-b border-ink-600 px-4 py-3">
            <p className="font-semibold">Notifications</p>
            <button className="text-sm text-ember hover:underline disabled:text-mist" disabled={unread === 0} onClick={() => read.mutate({ all: true })}>Mark all read</button>
          </div>
          <ul className="max-h-96 divide-y divide-ink-600 overflow-y-auto">
            {q.data?.items.length === 0 && <li className="p-4 text-sm text-mist">Nothing yet. Signed waivers, payments and claim updates show up here.</li>}
            {q.data?.items.map((n) => (
              <li key={n.id}>
                <button className="w-full px-4 py-3 text-left hover:bg-ink-700" onClick={() => { if (!n.read) read.mutate({ ids: [n.id] }); setOpen(false); if (n.href) router.push(n.href); }}>
                  <p className="flex items-start gap-2 text-sm font-medium">{!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ember" aria-label="unread" />}{n.title}</p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-sm text-mist-strong">{n.body}</p>}
                  <p className="mt-1 text-xs text-mist">{fmtDateTime(n.createdAt)}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
