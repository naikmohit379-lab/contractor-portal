"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { PAYMENT_STATUS_LABELS, type PaymentDTO, type ReconciliationException, type RefundDTO } from "@roofdesk/shared";
import { api, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, usd } from "@/lib/format";

type Row = PaymentDTO & { job?: { jobNumber: string; customer: string } };
interface Overview { provider: string; payments: Row[]; pendingRefunds: RefundDTO[]; collectedCents: number }

function ApproveRefund({ r }: { r: RefundDTO }) {
  const qc = useQueryClient();
  const payment = useQuery({ queryKey: ["payments"], queryFn: () => api<Overview>("/payments") }).data?.payments.find((p) => p.id === r.paymentId);
  const [password, setPassword] = useState("");
  const done = () => { qc.invalidateQueries({ queryKey: ["payments"] }); setPassword(""); };
  const jobId = payment?.jobId;
  const approve = useMutation({ mutationFn: () => post(`/jobs/${jobId}/payments/refunds/${r.id}/approve`, { password }), onSuccess: done });
  const reject = useMutation({ mutationFn: () => post(`/jobs/${jobId}/payments/refunds/${r.id}/reject`, { reason: "Not approved" }), onSuccess: done });
  return (
    <li className="space-y-3 p-4 text-sm">
      <p><span className="font-medium">{usd(r.amountCents)}</span> refund{payment?.job && ` on ${payment.job.jobNumber} (${payment.job.customer})`}: {r.reason}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div><label className="label" htmlFor={`ap-${r.id}`}>Your password, to confirm</label><input id={`ap-${r.id}`} type="password" autoComplete="current-password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <button className="btn btn-primary" disabled={!password || !jobId || approve.isPending} onClick={() => approve.mutate()}>Approve and refund</button>
        <button className="btn btn-ghost" disabled={!jobId || reject.isPending} onClick={() => reject.mutate()}>Reject</button>
      </div>
      {(approve.isError || reject.isError) && <p role="alert" className="text-bad">{((approve.error || reject.error) as Error).message}</p>}
    </li>
  );
}

export default function PaymentsPage() {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ["payments"], queryFn: () => api<Overview>("/payments") });
  const recon = useQuery({ queryKey: ["payments", "recon"], queryFn: () => api<{ checkedPayments: number; exceptions: ReconciliationException[] }>("/payments/reconciliation"), enabled: can("payment:approve"), retry: false });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-4xl font-bold">Payments</h1>
        <p className="text-sm text-mist">Collected, net of refunds <span className="font-display text-3xl font-bold text-white">{usd(q.data?.collectedCents ?? 0)}</span></p>
      </div>
      {q.data?.provider === "mock" && <p className="rounded-md bg-warn/10 p-3 text-sm text-warn">Test mode: payments are simulated and no real money moves.</p>}

      {(q.data?.pendingRefunds.length ?? 0) > 0 && can("payment:approve") && (
        <section aria-labelledby="appr" className="space-y-3">
          <h2 id="appr" className="text-2xl font-bold">Refunds waiting for approval</h2>
          <ul className="panel divide-y divide-ink-600">{q.data!.pendingRefunds.map((r) => <ApproveRefund key={r.id} r={r} />)}</ul>
          <p className="text-sm text-mist">The person who asked for a refund cannot approve it.</p>
        </section>
      )}

      {can("payment:approve") && (
        <section aria-labelledby="rec" className="space-y-3">
          <h2 id="rec" className="text-2xl font-bold">Reconciliation</h2>
          <div className="panel p-4 text-sm">
            {recon.isLoading && <p className="text-mist">Checking the ledger</p>}
            {recon.data && recon.data.exceptions.length === 0 && <p className="text-ok">All {recon.data.checkedPayments} payments agree with the ledger. This compares our own records. Matching against the gateway's balance report is a later step.</p>}
            {recon.data && recon.data.exceptions.length > 0 && (
              <ul className="space-y-2">{recon.data.exceptions.map((e, i) => <li key={i} className="text-warn">{e.message} {e.jobId && <Link className="underline" href={`/jobs/${e.jobId}?tab=payments`}>Open job</Link>}</li>)}</ul>
            )}
          </div>
        </section>
      )}

      <section aria-labelledby="all" className="space-y-3">
        <h2 id="all" className="text-2xl font-bold">All payments</h2>
        <ul className="panel divide-y divide-ink-600">
          {q.data?.payments.length === 0 && <li className="p-4 text-sm text-mist">No payments yet. Request one from a job's Payments tab.</li>}
          {q.data?.payments.map((p) => (
            <li key={p.id}>
              <Link href={`/jobs/${p.jobId}?tab=payments`} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm hover:bg-ink-700">
                <span><span className="font-medium">{usd(p.amountCents)}</span> {p.job && <span className="text-mist">{p.job.jobNumber} | {p.job.customer}</span>}<br /><span className="text-mist">{p.description} | {fmtDate(p.createdAt)}</span></span>
                <span className="rounded bg-ink-600 px-2 py-1 text-xs font-semibold">{PAYMENT_STATUS_LABELS[p.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
