"use client";

import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CLAIM_STATUS_LABELS, type AgingBucket, type ApprovalStats, type Receivables } from "@roofdesk/shared";
import { api, downloadFile } from "@/lib/api";
import { fmtDate, usd } from "@/lib/format";

interface Overview {
  generatedAt: string;
  claims: { total: number; byStatus: Record<string, number>; approval: ApprovalStats; avgCycleDays: number | null };
  waivers: { open: number; aging: AgingBucket[]; oldest: { waiverId: string; jobId: string; jobNumber: string; partyName: string; requestedAt: string }[] };
  receivables: Receivables;
  collectedByMonth: { month: string; cents: number }[];
}

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "bad" | "ok" }) {
  return (
    <div className="panel p-4">
      <p className="text-sm text-mist">{label}</p>
      <p className={`font-display text-3xl font-bold ${tone === "bad" ? "text-bad" : tone === "ok" ? "text-ok" : ""}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-mist">{hint}</p>}
    </div>
  );
}

/** Horizontal bars drawn with plain HTML. Every bar carries its number as text, so nothing depends on colour or sight. */
function Bars({ rows, format }: { rows: { label: string; value: number; sub?: string }[]; format: (n: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 text-sm">
          <span className="text-mist-strong">{r.label}</span>
          <span className="h-3 rounded-full bg-ink-700"><span className="block h-3 rounded-full bg-ember" style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value > 0 ? "6px" : 0 }} /></span>
          <span className="w-24 text-right font-medium">{format(r.value)}{r.sub && <span className="block text-xs font-normal text-mist">{r.sub}</span>}</span>
        </li>
      ))}
    </ul>
  );
}

const EXPORTS = [
  { kind: "jobs", label: "Jobs" },
  { kind: "payments", label: "Payments" },
  { kind: "waivers", label: "Waivers" },
  { kind: "ledger", label: "Ledger" },
] as const;

export function ReportsPanel() {
  const q = useQuery({ queryKey: ["reports", "overview"], queryFn: () => api<Overview>("/reports/overview"), staleTime: 30_000 });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const o = q.data;

  async function exportCsv(kind: string) {
    setBusy(kind); setErr(null);
    try { await downloadFile(`/reports/export/${kind}.csv`, `roofdesk-${kind}.csv`); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }

  if (q.isLoading) return <p className="text-mist">Loading reports</p>;
  if (q.isError || !o) return <p role="alert" className="text-bad">Reports could not be loaded. Refresh to try again.</p>;

  const thisMonth = o.collectedByMonth[o.collectedByMonth.length - 1]?.cents ?? 0;
  const r = o.receivables;
  const ap = o.claims.approval;
  const claimRows = Object.entries(o.claims.byStatus).map(([s, n]) => ({ label: CLAIM_STATUS_LABELS[s as keyof typeof CLAIM_STATUS_LABELS] ?? s, value: n }));

  return (
    <section aria-labelledby="rep" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="rep" className="text-2xl font-bold">Business overview</h2>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Download CSV exports">
          {EXPORTS.map((e) => (
            <button key={e.kind} className="btn btn-ghost h-10 min-h-0 px-3" disabled={busy !== null} onClick={() => exportCsv(e.kind)}>
              <Download size={15} aria-hidden /> {busy === e.kind ? "Preparing" : e.label}
            </button>
          ))}
        </div>
      </div>
      {err && <p role="alert" className="text-sm text-bad">{err}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Collected this month" value={usd(thisMonth)} hint="Net of refunds" />
        <Kpi label="Owed to you" value={usd(r.billedOutstandingCents)} hint={`${usd(r.awaitingWaiversCents)} more is waiting on waivers`} />
        <Kpi label="Overdue" value={usd(r.overdueCents)} tone={r.overdueCents > 0 ? "bad" : "ok"} hint="Past the payment's due date" />
        <Kpi label="Claim approval rate" value={ap.ratePct === null ? "No data" : `${ap.ratePct}%`} hint={ap.decided ? `${usd(ap.approvedCents)} of ${usd(ap.requestedCents)} on ${ap.decided} decided claims` : "Needs a decided claim"} />
        <Kpi label="Average claim cycle" value={o.claims.avgCycleDays === null ? "No data" : `${o.claims.avgCycleDays} days`} hint="Submitted to first decision" />
        <Kpi label="Waivers outstanding" value={String(o.waivers.open)} hint="Requested, not yet signed" tone={o.waivers.aging[3]!.count > 0 ? "bad" : undefined} />
        <Kpi label="Payment links out" value={usd(r.openRequestedCents)} hint="Sent, not yet settled" />
        <Kpi label="Claims on file" value={String(o.claims.total)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <article className="panel p-5">
          <h3 className="mb-4 text-xl font-bold">Collected by month</h3>
          <Bars rows={o.collectedByMonth.map((m) => ({ label: monthLabel(m.month), value: Math.max(m.cents, 0) }))} format={usd} />
        </article>
        <article className="panel p-5">
          <h3 className="mb-4 text-xl font-bold">How long waivers have waited</h3>
          <Bars rows={o.waivers.aging.map((b) => ({ label: b.label.replace(" days or more", "+ days").replace(" days", " d"), value: b.count, sub: b.count ? `oldest ${b.oldestDays} d` : undefined }))} format={(n) => String(n)} />
          {o.waivers.oldest.length > 0 && (
            <div className="mt-4 border-t border-ink-600 pt-3">
              <p className="mb-1 text-sm text-mist">Waiting longest</p>
              <ul className="space-y-1 text-sm">
                {o.waivers.oldest.map((w) => <li key={w.waiverId}><Link className="underline decoration-ink-500 hover:text-ember" href={`/jobs/${w.jobId}?tab=waivers`}>{w.partyName}</Link> <span className="text-mist">on {w.jobNumber}, since {fmtDate(w.requestedAt)}</span></li>)}
              </ul>
            </div>
          )}
        </article>
        <article className="panel p-5 lg:col-span-2">
          <h3 className="mb-4 text-xl font-bold">Claims by status</h3>
          {claimRows.length === 0 ? <p className="text-sm text-mist">No claims yet.</p> : <Bars rows={claimRows} format={(n) => String(n)} />}
        </article>
      </div>
      <p className="text-xs text-mist">Requested claim amounts use the replacement cost of each job's original estimate. Material price variance needs supplier invoices, which are not captured yet.</p>
    </section>
  );
}
