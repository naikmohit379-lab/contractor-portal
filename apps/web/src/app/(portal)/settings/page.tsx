"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GROUP_LABELS, JOB_STAGES, NOTIFICATION_GROUPS, STAGE_LABELS, type JobStageLabels, type NotificationGroup } from "@roofdesk/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

const GROUPS = Object.keys(NOTIFICATION_GROUPS) as NotificationGroup[];

export default function SettingsPage() {
  const { user, can, refreshUser } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notification-prefs"], queryFn: () => api<{ emailGroups: Record<NotificationGroup, boolean> }>("/notifications/preferences") });
  const save = useMutation({
    mutationFn: (emailGroups: Partial<Record<NotificationGroup, boolean>>) => api("/notifications/preferences", { method: "PUT", body: JSON.stringify({ emailGroups }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-prefs"] }),
  });
  type CompanySettings = {
    country: "IN" | "US"; currency: "INR" | "USD"; locale: "en-IN" | "hi-IN" | "en-US";
    language: "en" | "hi"; timezone: string; measurementSystem: "metric" | "imperial";
    paymentGating: "warn" | "block"; refundApprovalThresholdCents: number; stageLabels: JobStageLabels;
  };
  const companySettings = useQuery({
    queryKey: ["company-settings"],
    queryFn: () => api<{ settings: CompanySettings }>("/admin/settings"),
    enabled: can("user:manage"),
  });
  const [companyNotice, setCompanyNotice] = useState<string | null>(null);
  const saveCompany = useMutation({
    mutationFn: (settings: CompanySettings) => api<{ settings: CompanySettings }>("/admin/settings", { method: "PUT", body: JSON.stringify(settings) }),
    onSuccess: async () => { await refreshUser(); qc.invalidateQueries({ queryKey: ["company-settings"] }); qc.invalidateQueries({ queryKey: ["job-stage-labels"] }); setCompanyNotice(t("settings.saved")); },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-4xl font-bold">{t("settings.title")}</h1>
      <section aria-labelledby="em" className="panel space-y-4 p-5">
        <div>
          <h2 id="em" className="text-2xl font-bold">{t("settings.emailTitle")}</h2>
          <p className="text-sm text-mist">{t("settings.emailHelp", { email: user?.email ?? "" })}</p>
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
          <h2 id="company-controls" className="text-2xl font-bold">{t("settings.companyControls")}</h2>
          <p className="text-sm text-mist">These settings apply to everyone in {user?.company.name}.</p>
        </div>
        {companySettings.isLoading ? <p className="text-sm text-mist">{t("common.loadingWorkspace")}</p> : companySettings.isError || !companySettings.data ? <p role="alert" className="text-sm text-bad">Company controls could not be loaded. {(companySettings.error as Error | undefined)?.message}</p> : <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          const stageLabels = Object.fromEntries(JOB_STAGES.map((stage) => [stage, String(values.get(`stageLabel_${stage}`) ?? STAGE_LABELS[stage])])) as JobStageLabels;
          saveCompany.mutate({
            country: values.get("country") as CompanySettings["country"],
            currency: values.get("currency") as CompanySettings["currency"],
            locale: values.get("locale") as CompanySettings["locale"],
            language: values.get("language") as CompanySettings["language"],
            timezone: String(values.get("timezone") ?? ""),
            measurementSystem: values.get("measurementSystem") as CompanySettings["measurementSystem"],
            paymentGating: values.get("paymentGating") as CompanySettings["paymentGating"],
            refundApprovalThresholdCents: Math.round(Number(values.get("refundApprovalThresholdDollars")) * 100), stageLabels,
          });
        }}>
          <fieldset className="space-y-4">
            <legend className="text-lg font-bold">{t("settings.marketTitle")}</legend>
            <p className="text-sm text-mist">{t("settings.marketHelp", { company: user?.company.name ?? "" })}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="label" htmlFor="market-country">{t("settings.country")}</label><select id="market-country" name="country" className="field" defaultValue={companySettings.data.settings.country}><option value="IN">{t("jobs.countryIndia")}</option><option value="US">{t("jobs.countryUs")}</option></select></div>
              <div><label className="label" htmlFor="market-currency">{t("settings.currency")}</label><select id="market-currency" name="currency" className="field" defaultValue={companySettings.data.settings.currency}><option value="INR">INR (₹)</option><option value="USD">USD ($)</option></select></div>
              <div><label className="label" htmlFor="market-locale">{t("settings.locale")}</label><select id="market-locale" name="locale" className="field" defaultValue={companySettings.data.settings.locale}><option value="en-IN">English (India)</option><option value="hi-IN">हिन्दी (भारत)</option><option value="en-US">English (United States)</option></select></div>
              <div><label className="label" htmlFor="market-language">{t("settings.language")}</label><select id="market-language" name="language" className="field" defaultValue={companySettings.data.settings.language}><option value="en">{t("settings.english")}</option><option value="hi">{t("settings.hindi")}</option></select></div>
              <div><label className="label" htmlFor="market-timezone">{t("settings.timezone")}</label><input id="market-timezone" name="timezone" className="field" defaultValue={companySettings.data.settings.timezone} list="timezone-examples" /><datalist id="timezone-examples"><option value="Asia/Kolkata" /><option value="America/Chicago" /><option value="America/New_York" /></datalist></div>
              <div><label className="label" htmlFor="market-units">{t("settings.units")}</label><select id="market-units" name="measurementSystem" className="field" defaultValue={companySettings.data.settings.measurementSystem}><option value="metric">{t("settings.metric")}</option><option value="imperial">{t("settings.imperial")}</option></select></div>
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor="payment-gating">When a payment is marked ready with unsigned waivers</label>
            <select id="payment-gating" name="paymentGating" className="field" defaultValue={companySettings.data.settings.paymentGating}>
              <option value="warn">Warn and require a recorded reason to continue</option>
              <option value="block">Block until required waivers are signed</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="refund-threshold">Require a second approver for refunds above ({companySettings.data.settings.currency})</label>
            <input id="refund-threshold" name="refundApprovalThresholdDollars" className="field" type="number" min="0" max="1000000" step="0.01" defaultValue={(companySettings.data.settings.refundApprovalThresholdCents / 100).toFixed(2)} />
            <p className="mt-1 text-xs text-mist">Enter 0 to turn off the second-approval threshold. Owners and admins cannot approve their own large refund.</p>
          </div>
          <fieldset className="space-y-3 border-t border-ink-600 pt-4">
            <legend className="text-lg font-bold">Job pipeline labels</legend>
            <p className="text-sm text-mist">Rename the standard stages shown across the job list and dashboard. This changes display names only; workflow order and stage behavior stay the same.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {JOB_STAGES.map((stage) => (
                <div key={stage}>
                  <label className="label" htmlFor={`stageLabel_${stage}`}>{STAGE_LABELS[stage]}</label>
                  <input id={`stageLabel_${stage}`} name={`stageLabel_${stage}`} className="field" maxLength={40} required defaultValue={companySettings.data!.settings.stageLabels[stage]} />
                </div>
              ))}
            </div>
          </fieldset>
          <button className="btn btn-primary" type="submit" disabled={saveCompany.isPending}>{saveCompany.isPending ? t("settings.savingPreferences") : t("settings.savePreferences")}</button>
          {companyNotice && <p role="status" className="text-sm text-ok">{companyNotice}</p>}
          {saveCompany.isError && <p role="alert" className="text-sm text-bad">{(saveCompany.error as Error).message}</p>}
        </form>}
      </section>}
    </div>
  );
}
