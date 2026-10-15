"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GROUP_LABELS, NOTIFICATION_GROUPS, type NotificationGroup } from "@roofdesk/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const GROUPS = Object.keys(NOTIFICATION_GROUPS) as NotificationGroup[];

export default function SettingsPage() {
  const { user, can } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notification-prefs"], queryFn: () => api<{ emailGroups: Record<NotificationGroup, boolean> }>("/notifications/preferences") });
  const save = useMutation({
    mutationFn: (emailGroups: Partial<Record<NotificationGroup, boolean>>) => api("/notifications/preferences", { method: "PUT", body: JSON.stringify({ emailGroups }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-prefs"] }),
  });
  type CompanySettings = { paymentGating: "warn" | "block"; refundApprovalThresholdCents: number };
  const companySettings = useQuery({
    queryKey: ["company-settings"],
    queryFn: () => api<{ settings: CompanySettings }>("/admin/settings"),
    enabled: can("user:manage"),
  });
  const [companyNotice, setCompanyNotice] = useState<string | null>(null);
  const saveCompany = useMutation({
    mutationFn: (settings: CompanySettings) => api<{ settings: CompanySettings }>("/admin/settings", { method: "PUT", body: JSON.stringify(settings) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["company-settings"] }); setCompanyNotice("Company controls saved."); },
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
      {can("user:manage") && <section aria-labelledby="company-controls" className="panel space-y-4 p-5">
        <div>
          <h2 id="company-controls" className="text-2xl font-bold">Company controls</h2>
          <p className="text-sm text-mist">These settings apply to everyone in {user?.company.name}.</p>
        </div>
        {companySettings.isLoading ? <p className="text-sm text-mist">Loading company controls…</p> : companySettings.isError || !companySettings.data ? <p role="alert" className="text-sm text-bad">Company controls could not be loaded. {(companySettings.error as Error | undefined)?.message}</p> : <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          saveCompany.mutate({ paymentGating: values.get("paymentGating") as CompanySettings["paymentGating"], refundApprovalThresholdCents: Math.round(Number(values.get("refundApprovalThresholdDollars")) * 100) });
        }}>
          <div>
            <label className="label" htmlFor="payment-gating">When a payment is marked ready with unsigned waivers</label>
            <select id="payment-gating" name="paymentGating" className="field" defaultValue={companySettings.data.settings.paymentGating}>
              <option value="warn">Warn and require a recorded reason to continue</option>
              <option value="block">Block until required waivers are signed</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="refund-threshold">Require a second approver for refunds above (USD)</label>
            <input id="refund-threshold" name="refundApprovalThresholdDollars" className="field" type="number" min="0" max="1000000" step="0.01" defaultValue={(companySettings.data.settings.refundApprovalThresholdCents / 100).toFixed(2)} />
            <p className="mt-1 text-xs text-mist">Enter 0 to turn off the second-approval threshold. Owners and admins cannot approve their own large refund.</p>
          </div>
          <button className="btn btn-primary" type="submit" disabled={saveCompany.isPending}>{saveCompany.isPending ? "Saving…" : "Save company controls"}</button>
          {companyNotice && <p role="status" className="text-sm text-ok">{companyNotice}</p>}
          {saveCompany.isError && <p role="alert" className="text-sm text-bad">{(saveCompany.error as Error).message}</p>}
        </form>}
      </section>}
    </div>
  );
}
