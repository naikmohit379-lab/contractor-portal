"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GROUP_LABELS, NOTIFICATION_GROUPS, type NotificationGroup } from "@roofdesk/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const GROUPS = Object.keys(NOTIFICATION_GROUPS) as NotificationGroup[];

export default function SettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notification-prefs"], queryFn: () => api<{ emailGroups: Record<NotificationGroup, boolean> }>("/notifications/preferences") });
  const save = useMutation({
    mutationFn: (emailGroups: Partial<Record<NotificationGroup, boolean>>) => api("/notifications/preferences", { method: "PUT", body: JSON.stringify({ emailGroups }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-prefs"] }),
  });

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-4xl font-bold">Settings</h1>
      <section aria-labelledby="em" className="panel space-y-4 p-5">
        <div>
          <h2 id="em" className="text-2xl font-bold">Email notifications</h2>
          <p className="text-sm text-mist">Everything always appears in the bell inside RoofDesk. Choose what is also emailed to {user?.email}.</p>
        </div>
        <ul className="divide-y divide-ink-600">
          {GROUPS.map((g) => (
            <li key={g}>
              <label className="flex min-h-[56px] cursor-pointer items-center justify-between gap-4 py-2">
                <span className="text-sm">{GROUP_LABELS[g]}</span>
                <input type="checkbox" className="h-6 w-6 accent-ember" disabled={!q.data || save.isPending} checked={q.data?.emailGroups[g] ?? false} onChange={(e) => save.mutate({ [g]: e.target.checked })} />
              </label>
            </li>
          ))}
        </ul>
        {save.isError && <p role="alert" className="text-sm text-bad">{(save.error as Error).message}</p>}
      </section>
    </div>
  );
}
