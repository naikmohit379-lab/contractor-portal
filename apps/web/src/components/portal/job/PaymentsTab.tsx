"use client";

import clsx from "clsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PAYMENT_STATUS_LABELS, type MilestoneDTO, type PaymentDTO, type RefundDTO } from "@roofdesk/shared";
import { NumInput } from "@/components/NumInput";
import { ApiError, api, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { centsToDollars, dollarsToCents, fmtDate, fmtDateTime, usd } from "@/lib/format";

const TONE: Record<string, string> = {
  requested: "bg-warn/15 text-warn",
  pending: "bg-sky-400/15 text-sky-300",
  succeeded: "bg-ok/15 text-ok",
  failed: "bg-bad/15 text-bad",
  partially_refunded: "bg-ember/15 text-ember-300",
  refunded: "bg-ink-600 text-mist-strong",
  canceled: "bg-ink-600 text-mist",
};

interface PaymentsResponse { provider: string; payments: PaymentDTO[]; refunds: RefundDTO[]; collectedCents: number }

function LinkBox({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2 rounded-md border border-ember/40 bg-ember/10 p-3 text-sm">
      <p className="font-medium">Send this link to the payer. It is shown once. They pay on the gateway's secure page.</p>
      <div className="flex flex-wrap gap-2">
        <input readOnly aria-label="Payment link" className="field flex-1" value={url} onFocus={(e) => e.currentTarget.select()} />
        <button className="btn btn-ghost" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }}>{copied ? "Copied" : "Copy"}</button>
        <button className="btn btn-ghost" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function RefundForm({ jobId, p, onDone }: { jobId: string; p: PaymentDTO; onDone: () => void }) {
  const qc = useQueryClient();
  const max = p.amountCents - p.refundedCents;
  const [amount, setAmount] = useState(max);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const refund = useMutation({
    mutationFn: () => post<{ needsApproval: boolean }>(`/jobs/${jobId}/payments/${p.id}/refunds`, { amountCents: amount, reason, password }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["jobs", jobId] });
      if (r.needsApproval) setNote("This refund is above your approval limit. A different person must approve it before money moves.");
      else onDone();
    },
  });
  return (
    <div className="mt-3 space-y-3 rounded-md border border-ink-500 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="label">Refund amount (USD)</label><NumInput value={amount} format={(c) => centsToDollars(c)} parse={(s) => dollarsToCents(parseFloat(s))} onCommit={setAmount} /><p className="mt-1 text-xs text-mist">Up to {usd(max)}</p></div>
        <div className="sm:col-span-2"><label className="label" htmlFor={`rr-${p.id}`}>Reason</label><input id={`rr-${p.id}`} className="field" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      </div>
      <div className="max-w-xs"><label className="label" htmlFor={`rp-${p.id}`}>Your password, to confirm</label><input id={`rp-${p.id}`} type="password" autoComplete="current-password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      {refund.isError && <p role="alert" className="text-sm text-bad">{(refund.error as Error).message}</p>}
      {note && <p role="status" className="text-sm text-warn">{note}</p>}
      <div className="flex gap-3">
        <button className="btn btn-primary" disabled={refund.isPending || amount < 1 || reason.trim().length < 3 || !password || !!note} onClick={() => refund.mutate()}>{refund.isPending ? "Working" : "Refund"}</button>
        <button className="btn btn-ghost" onClick={onDone}>Close</button>
      </div>
    </div>
  );
}

function PaymentRow({ jobId, p, refunds }: { jobId: string; p: PaymentDTO; refunds: RefundDTO[] }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [link, setLink] = useState<string | null>(null);
  const [refunding, setRefunding] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["jobs", jobId] });
  const resend = useMutation({ mutationFn: () => post<{ payUrl: string }>(`/jobs/${jobId}/payments/${p.id}/resend`), onSuccess: (r) => { setLink(r.payUrl); refresh(); } });
  const cancel = useMutation({ mutationFn: () => post(`/jobs/${jobId}/payments/${p.id}/cancel`), onSuccess: refresh });
  const refundable = (p.status === "succeeded" || p.status === "partially_refunded") && p.refundedCents < p.amountCents;

  return (
    <li className="p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{usd(p.amountCents)} <span className="font-normal text-mist">from {p.payerName}</span></p>
          <p className="text-mist">{p.description} | requested {fmtDate(p.createdAt)}{p.paidAt && ` | paid ${fmtDateTime(p.paidAt)}`}{p.refundedCents > 0 && ` | refunded ${usd(p.refundedCents)}`}</p>
          {p.failureReason && <p className="text-bad">{p.failureReason}</p>}
          {p.flag && <p className="text-warn">Needs review: {p.flag.replace("_", " ")}</p>}
          {p.disputed && <p className="text-warn">A dispute is open on this payment.</p>}
        </div>
        <span className={clsx("rounded px-2 py-1 text-xs font-semibold", TONE[p.status])}>{PAYMENT_STATUS_LABELS[p.status]}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {["requested", "pending", "failed"].includes(p.status) && can("payment:request") && <button className="btn btn-ghost h-9 min-h-0 px-3" disabled={resend.isPending} onClick={() => resend.mutate()}>New link</button>}
        {["requested", "failed"].includes(p.status) && can("payment:request") && <button className="btn btn-ghost h-9 min-h-0 px-3" onClick={() => cancel.mutate()}>Cancel</button>}
        {refundable && can("payment:refund") && !refunding && <button className="btn btn-ghost h-9 min-h-0 px-3" onClick={() => setRefunding(true)}>Refund</button>}
      </div>
      {link && <div className="mt-3"><LinkBox url={link} onClose={() => setLink(null)} /></div>}
      {refunding && <RefundForm jobId={jobId} p={p} onDone={() => setRefunding(false)} />}
      {refunds.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-ink-600 pt-3 text-mist">
          {refunds.map((r) => <li key={r.id}>Refund {usd(r.amountCents)}: {r.reason} ({r.status.replace("_", " ")}{r.failureReason ? `, ${r.failureReason}` : ""})</li>)}
        </ul>
      )}
    </li>
  );
}

function RequestPayment({ jobId, m, onDone }: { jobId: string; m: MilestoneDTO; onDone: (url: string) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const req = useMutation({
    mutationFn: () => post<{ payUrl: string }>(`/jobs/${jobId}/payments`, { milestoneId: m.id, payerName: name, payerEmail: email, amountCents: amount ?? undefined }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["jobs", jobId] }); onDone(r.payUrl); },
  });
  return (
    <div className="mt-3 space-y-3 rounded-md border border-ink-500 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="label" htmlFor={`pn-${m.id}`}>Payer name</label><input id={`pn-${m.id}`} className="field" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label" htmlFor={`pe-${m.id}`}>Payer email</label><input id={`pe-${m.id}`} type="email" inputMode="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="label">Amount (blank = all that is owed)</label><NumInput value={amount ?? 0} format={(c) => (amount === null ? "" : centsToDollars(c))} parse={(s) => dollarsToCents(parseFloat(s))} onCommit={setAmount} placeholder={centsToDollars(m.expectedAmountCents)} /></div>
      </div>
      {req.isError && <p role="alert" className="text-sm text-bad">{(req.error as Error).message}</p>}
      <button className="btn btn-primary" disabled={req.isPending || name.trim().length < 2} onClick={() => req.mutate()}>{req.isPending ? "Creating link" : "Create payment link"}</button>
    </div>
  );
}

export function PaymentsTab({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["jobs", jobId, "payments"], queryFn: () => api<PaymentsResponse>(`/jobs/${jobId}/payments`), refetchInterval: 10_000 });
  const ms = useQuery({ queryKey: ["jobs", jobId, "milestones"], queryFn: () => api<{ items: MilestoneDTO[] }>(`/jobs/${jobId}/milestones`) });
  const { can } = useAuth();

  const ready = ms.data?.items.filter((m) => m.status === "ready") ?? [];
  const waiting = ms.data?.items.filter((m) => m.status === "pending") ?? [];

  return (
    <section aria-label="Payments" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-2xl font-bold">Payments</h2>
        <p className="text-sm text-mist">Collected so far <span className="font-display text-2xl font-bold text-white">{usd(q.data?.collectedCents ?? 0)}</span></p>
      </div>
      {q.data?.provider === "mock" && <p className="rounded-md bg-warn/10 p-3 text-sm text-warn">Test mode: payments are simulated and no real money moves. Set PAYMENT_PROVIDER=stripe on the server to use Stripe.</p>}

      <div className="space-y-3">
        <h3 className="text-xl font-bold">Ready to bill</h3>
        {ready.length === 0 && <p className="panel p-4 text-sm text-mist">Nothing is ready to bill. On the Waivers tab, collect the waivers and mark a payment ready first.{waiting.length > 0 && ` ${waiting.length} payment${waiting.length > 1 ? "s are" : " is"} still waiting on waivers.`}</p>}
        {ready.map((m) => (
          <article key={m.id} className="panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="font-medium">{m.label}</p><p className="text-sm text-mist">Expected {usd(m.expectedAmountCents)}</p></div>
              {can("payment:request") && <button className="btn btn-primary" onClick={() => { setOpen(open === m.id ? null : m.id); setLink(null); }}>Request payment</button>}
            </div>
            {open === m.id && !link && <RequestPayment jobId={jobId} m={m} onDone={setLink} />}
            {open === m.id && link && <div className="mt-3"><LinkBox url={link} onClose={() => { setLink(null); setOpen(null); }} /></div>}
          </article>
        ))}
      </div>

      <div className="space-y-3">
        <h3 className="text-xl font-bold">Payment history</h3>
        <ul className="panel divide-y divide-ink-600">
          {q.data?.payments.length === 0 && <li className="p-4 text-sm text-mist">No payments requested yet.</li>}
          {q.data?.payments.map((p) => <PaymentRow key={p.id} jobId={jobId} p={p} refunds={q.data!.refunds.filter((r) => r.paymentId === p.id)} />)}
        </ul>
      </div>
    </section>
  );
}
