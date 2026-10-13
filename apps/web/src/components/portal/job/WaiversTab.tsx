"use client";

import clsx from "clsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import {
  MILESTONE_TYPES,
  PARTY_TYPES,
  WAIVER_TYPE_LABELS,
  acceptableWaiverTypes,
  defaultRequestType,
  type MilestoneDTO,
  type PartyDTO,
  type WaiverDTO,
  type WaiverType,
} from "@roofdesk/shared";
import { NumInput } from "@/components/NumInput";
import { ApiError, api, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { centsToDollars, dollarsToCents, fmtDate, fmtDateTime, usd } from "@/lib/format";

const STATUS_STYLE: Record<string, string> = {
  signed: "bg-ok/15 text-ok",
  requested: "bg-warn/15 text-warn",
  viewed: "bg-sky-400/15 text-sky-300",
  declined: "bg-bad/15 text-bad",
  expired: "bg-bad/15 text-bad",
  cancelled: "bg-ink-600 text-mist",
  none: "bg-ink-700 text-mist",
};

/** The waiver that best represents a party for one payment: signed beats open beats closed, newest first. */
function bestWaiver(waivers: WaiverDTO[], partyId: string, milestone: MilestoneDTO) {
  const ok = new Set(acceptableWaiverTypes(milestone.type));
  const rank = (s: string) => (s === "signed" ? 0 : s === "viewed" || s === "requested" ? 1 : 2);
  return waivers
    .filter((w) => w.milestoneId === milestone.id && w.partyId === partyId && ok.has(w.type))
    .sort((a, b) => rank(a.status) - rank(b.status) || b.requestedAt.localeCompare(a.requestedAt))[0];
}

function CopyLinks({ links, onClose }: { links: { label: string; url: string; emailedTo?: string }[]; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div className="space-y-3 rounded-md border border-ember/40 bg-ember/10 p-4 text-sm">
      <p className="font-medium">Each person has their own signing link. Links are shown once. {links.some((l) => l.emailedTo) && "People with an email on file were emailed automatically."}</p>
      {links.map((l) => (
        <div key={l.url} className="flex flex-wrap items-center gap-2">
          <span className="w-40 shrink-0 font-medium">{l.label}{l.emailedTo && <span className="block text-xs font-normal text-ok">Emailed to {l.emailedTo}</span>}</span>
          <input readOnly aria-label={`Signing link for ${l.label}`} className="field flex-1" value={l.url} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn btn-ghost" onClick={async () => { await navigator.clipboard.writeText(l.url); setCopied(l.url); }}>{copied === l.url ? "Copied" : "Copy"}</button>
        </div>
      ))}
      <button className="btn btn-ghost" onClick={onClose}>Done</button>
    </div>
  );
}

function WaiverViewer({ jobId, waiverId }: { jobId: string; waiverId: string }) {
  const q = useQuery({ queryKey: ["jobs", jobId, "waiver", waiverId], queryFn: () => api<{ waiver: WaiverDTO; text: string; signatureImage?: string; integrity: string }>(`/jobs/${jobId}/waivers/${waiverId}`) });
  if (!q.data) return <p className="p-3 text-sm text-mist">Loading document</p>;
  const { waiver: w, text, signatureImage, integrity } = q.data;
  return (
    <div className="space-y-3 border-t border-ink-600 p-4 text-sm">
      <pre className="whitespace-pre-wrap rounded-md bg-white p-4 font-sans text-ink-900">{text}</pre>
      {w.status === "signed" && (
        <div className="space-y-2">
          <p>Signed by <strong>{w.signerName}</strong> on {w.signedAt && fmtDateTime(w.signedAt)}</p>
          {signatureImage && <img src={signatureImage} alt={`Signature of ${w.signerName}`} className="h-20 rounded bg-white" />}
          <p className={integrity === "valid" ? "text-ok" : "text-bad"}>
            {integrity === "valid" ? "Integrity check passed: this document has not been altered since signing." : "Integrity check FAILED: this record does not match its fingerprint."}
          </p>
          <p className="break-all text-mist">Fingerprint {w.documentHash}</p>
          {w.needsReview.length > 0 && <ul className="list-disc pl-5 text-warn">{w.needsReview.map((n) => <li key={n}>{n}</li>)}</ul>}
        </div>
      )}
      {w.declineReason && <p className="text-bad">Declined: {w.declineReason}</p>}
    </div>
  );
}

function MilestoneCard({ jobId, m, parties, waivers, gating }: { jobId: string; m: MilestoneDTO; parties: PartyDTO[]; waivers: WaiverDTO[]; gating: string }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const refresh = () => { qc.invalidateQueries({ queryKey: ["jobs", jobId, "milestones"] }); qc.invalidateQueries({ queryKey: ["jobs", jobId, "waivers"] }); };
  const accept = acceptableWaiverTypes(m.type);
  const [type, setType] = useState<WaiverType>(defaultRequestType(m.type));
  const [through, setThrough] = useState(new Date().toISOString().slice(0, 10));
  const [links, setLinks] = useState<{ label: string; url: string; emailedTo?: string }[] | null>(null);
  const [skipped, setSkipped] = useState<{ party: string; reason: string }[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [needsTemplate, setNeedsTemplate] = useState(false);

  const onErr = (e: unknown) => setNeedsTemplate(e instanceof ApiError && e.code === "template_not_approved");

  const bulk = useMutation({
    mutationFn: () => post<{ created: { party: string; signUrl: string; emailedTo?: string }[]; skipped: { party: string; reason: string }[] }>(`/jobs/${jobId}/waivers/bulk`, { milestoneId: m.id, type, throughDate: through }),
    onSuccess: (r) => { setNeedsTemplate(false); setSkipped(r.skipped); setLinks(r.created.map((c) => ({ label: c.party, url: c.signUrl, emailedTo: c.emailedTo }))); refresh(); },
    onError: onErr,
  });
  const resend = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) => post<{ signUrl: string; emailedTo?: string }>(`/jobs/${jobId}/waivers/${id}/resend`).then((r) => ({ label, url: r.signUrl, emailedTo: r.emailedTo })),
    onSuccess: (l) => { setLinks([l]); refresh(); },
  });
  const cancel = useMutation({ mutationFn: (id: string) => post(`/jobs/${jobId}/waivers/${id}/cancel`), onSuccess: refresh });
  const ready = useMutation({
    mutationFn: (override?: boolean) => post(`/jobs/${jobId}/milestones/${m.id}/mark-ready`, override ? { overrideMissing: true } : {}),
    onSuccess: refresh,
  });

  const needsConfirm = ready.error instanceof ApiError && ready.error.code === "waivers_missing_confirm";
  const r = m.readiness;

  return (
    <article className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold">{m.label}</h3>
          <p className="text-sm text-mist"><span className="capitalize">{m.type}</span> | {usd(m.expectedAmountCents)}{m.dueDate && ` | due ${fmtDate(m.dueDate)}`}</p>
        </div>
        <span className={clsx("rounded px-3 py-1 text-sm font-semibold", m.status === "pending" ? (r.ready ? "bg-ok/15 text-ok" : "bg-warn/15 text-warn") : "bg-ok/25 text-ok")}>
          {m.status !== "pending" ? (m.status === "ready" ? "Released" : "Paid") : !m.requireWaivers ? "No waivers needed" : r.ready ? "All waivers in" : `${r.signed} of ${r.required} waivers signed`}
        </span>
      </div>
      {m.overrideNote && <p className="mt-2 text-sm text-warn">{m.overrideNote}</p>}

      {m.requireWaivers && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-mist"><tr><th className="pb-2 font-medium">Party</th><th className="pb-2 font-medium">Waiver</th><th className="pb-2 font-medium">Amount</th><th /></tr></thead>
            <tbody>
              {parties.filter((p) => p.requiresWaiver).map((p) => {
                const w = bestWaiver(waivers, p.id, m);
                const status: string = w ? w.status : "none";
                return (
                  <tr key={p.id} className="border-t border-ink-600 align-top">
                    <td className="py-3 pr-3 font-medium">{p.name}</td>
                    <td className="pr-3">
                      <span className={clsx("inline-block rounded px-2 py-1 text-xs font-semibold capitalize", STATUS_STYLE[status])}>{status === "none" ? "Not requested" : status}</span>
                      {w && w.needsReview.length > 0 && <span className="ml-2 text-xs text-warn">Review</span>}
                    </td>
                    <td className="pr-3">{w ? usd(w.amountCents) : "-"}</td>
                    <td className="space-x-2 whitespace-nowrap py-2 text-right">
                      {w && <button className="btn btn-ghost h-9 min-h-0 px-3" aria-expanded={open === w.id} onClick={() => setOpen(open === w.id ? null : w.id)}>{open === w.id ? "Hide" : "View"}</button>}
                      {w && can("waiver:request") && ["requested", "viewed", "expired"].includes(w.status) && (
                        <>
                          <button className="btn btn-ghost h-9 min-h-0 px-3" disabled={resend.isPending} onClick={() => resend.mutate({ id: w.id, label: p.name })}>New link</button>
                          <button className="btn btn-ghost h-9 min-h-0 px-3" onClick={() => cancel.mutate(w.id)}>Cancel</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {open && <WaiverViewer jobId={jobId} waiverId={open} />}
        </div>
      )}

      {m.requireWaivers && m.status === "pending" && can("waiver:request") && (
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-ink-600 pt-4">
          <div>
            <label className="label" htmlFor={`t-${m.id}`}>Waiver form</label>
            <select id={`t-${m.id}`} className="field" value={type} onChange={(e) => setType(e.target.value as WaiverType)}>
              {accept.map((t) => <option key={t} value={t}>{WAIVER_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`d-${m.id}`}>Through date</label>
            <input id={`d-${m.id}`} type="date" className="field" value={through} onChange={(e) => setThrough(e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={bulk.isPending} onClick={() => bulk.mutate()}>{bulk.isPending ? "Requesting" : "Request missing waivers"}</button>
        </div>
      )}
      {needsTemplate && <p role="alert" className="mt-3 text-sm text-warn">This waiver form is not approved yet. <Link href="/waivers" className="font-semibold underline">Review and approve it under Waiver forms</Link>, then request again.</p>}
      {bulk.isError && !needsTemplate && <p role="alert" className="mt-3 text-sm text-bad">{(bulk.error as Error).message}</p>}
      {skipped.length > 0 && <ul className="mt-3 text-sm text-mist">{skipped.map((s) => <li key={s.party}>{s.party}: {s.reason}</li>)}</ul>}
      {links && <div className="mt-4"><CopyLinks links={links} onClose={() => { setLinks(null); setSkipped([]); }} /></div>}
      <p className="mt-3 text-xs text-mist">Each party's amount is its share of the payment, by contract amount.</p>

      {m.status === "pending" && can("payment:request") && (
        <div className="mt-4 space-y-2 border-t border-ink-600 pt-4">
          <button className="btn btn-primary" disabled={ready.isPending} onClick={() => ready.mutate(false)}>Mark payment ready</button>
          {needsConfirm && (
            <div className="rounded-md border border-warn/40 bg-warn/10 p-3 text-sm">
              <p>{(ready.error as Error).message}</p>
              <button className="btn btn-ghost mt-2" onClick={() => ready.mutate(true)}>Release anyway</button>
            </div>
          )}
          {ready.isError && !needsConfirm && <p role="alert" className="text-sm text-bad">{(ready.error as Error).message}</p>}
          {gating === "block" && <p className="text-xs text-mist">Your company blocks payments until waivers are signed.</p>}
        </div>
      )}
    </article>
  );
}

function PartiesSection({ jobId, parties }: { jobId: string; parties: PartyDTO[] }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ type: "supplier", name: "", contactName: "", email: "", contract: 0 });
  const refresh = () => qc.invalidateQueries({ queryKey: ["jobs", jobId, "parties"] });
  const add = useMutation({
    mutationFn: () => post(`/jobs/${jobId}/parties`, { type: f.type, name: f.name, contactName: f.contactName || undefined, email: f.email, contractAmountCents: f.contract, requiresWaiver: true }),
    onSuccess: () => { setAdding(false); setF({ type: "supplier", name: "", contactName: "", email: "", contract: 0 }); refresh(); },
  });
  const remove = useMutation({ mutationFn: (id: string) => api(`/jobs/${jobId}/parties/${id}`, { method: "DELETE" }), onSuccess: refresh });

  return (
    <section aria-labelledby="parties" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="parties" className="text-2xl font-bold">Who must sign</h2>
        {can("waiver:request") && !adding && <button className="btn btn-ghost" onClick={() => setAdding(true)}>Add supplier or crew</button>}
      </div>
      {adding && (
        <div className="panel space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label" htmlFor="pt">Type</label><select id="pt" className="field" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{PARTY_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</select></div>
            <div><label className="label" htmlFor="pn">Company or person</label><input id="pn" className="field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div><label className="label" htmlFor="pc">Contact name</label><input id="pc" className="field" value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} /></div>
            <div><label className="label" htmlFor="pe">Email</label><input id="pe" type="email" inputMode="email" className="field" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
            <div><label className="label">Contract amount (USD)</label><NumInput value={f.contract} format={(c) => centsToDollars(c)} parse={(s) => dollarsToCents(parseFloat(s))} onCommit={(c) => setF({ ...f, contract: c })} /></div>
          </div>
          {add.isError && <p role="alert" className="text-sm text-bad">{(add.error as Error).message}</p>}
          <div className="flex gap-3"><button className="btn btn-primary" disabled={add.isPending || f.name.trim().length < 2} onClick={() => add.mutate()}>Save</button><button className="btn btn-ghost" onClick={() => setAdding(false)}>Cancel</button></div>
        </div>
      )}
      <ul className="panel divide-y divide-ink-600">
        {parties.length === 0 && <li className="p-4 text-sm text-mist">No one added yet. Add each supplier and crew that must sign a waiver before you release a payment.</li>}
        {parties.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div><p className="font-medium">{p.name} <span className="ml-2 text-xs capitalize text-mist">{p.type.replace("_", " ")}</span></p><p className="text-mist">{[p.contactName, p.email].filter(Boolean).join(" | ") || "No contact"} | Contract {usd(p.contractAmountCents)}</p></div>
            {can("waiver:request") && <button className="btn btn-ghost h-9 min-h-0 px-3" onClick={() => remove.mutate(p.id)}>Remove</button>}
          </li>
        ))}
      </ul>
      {remove.isError && <p role="alert" className="text-sm text-bad">{(remove.error as Error).message}</p>}
    </section>
  );
}

function NewMilestone({ jobId, onDone }: { jobId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ label: "", type: "progress", amount: 0, due: "", requireWaivers: true });
  const add = useMutation({
    mutationFn: () => post(`/jobs/${jobId}/milestones`, { label: f.label, type: f.type, expectedAmountCents: f.amount, dueDate: f.due || undefined, requireWaivers: f.requireWaivers }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["jobs", jobId, "milestones"] }); onDone(); },
  });
  return (
    <div className="panel space-y-4 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="ml">Payment name</label><input id="ml" className="field" placeholder="Draw 1, after tear-off" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></div>
        <div><label className="label" htmlFor="mt">Type</label><select id="mt" className="field" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value, requireWaivers: e.target.value !== "deposit" })}>{MILESTONE_TYPES.map((t) => <option key={t} value={t}>{t[0]!.toUpperCase() + t.slice(1)}</option>)}</select></div>
        <div><label className="label">Expected amount (USD)</label><NumInput value={f.amount} format={(c) => centsToDollars(c)} parse={(s) => dollarsToCents(parseFloat(s))} onCommit={(c) => setF({ ...f, amount: c })} /></div>
        <div><label className="label" htmlFor="md">Due date</label><input id="md" type="date" className="field" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></div>
      </div>
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-ember" checked={f.requireWaivers} onChange={(e) => setF({ ...f, requireWaivers: e.target.checked })} /> Require lien waivers before this payment is released</label>
      {add.isError && <p role="alert" className="text-sm text-bad">{(add.error as Error).message}</p>}
      <div className="flex gap-3"><button className="btn btn-primary" disabled={add.isPending || f.label.trim().length < 2} onClick={() => add.mutate()}>Save payment</button><button className="btn btn-ghost" onClick={onDone}>Cancel</button></div>
    </div>
  );
}

export function WaiversTab({ jobId }: { jobId: string }) {
  const { can } = useAuth();
  const [adding, setAdding] = useState(false);
  const parties = useQuery({ queryKey: ["jobs", jobId, "parties"], queryFn: () => api<{ items: PartyDTO[] }>(`/jobs/${jobId}/parties`) });
  const milestones = useQuery({ queryKey: ["jobs", jobId, "milestones"], queryFn: () => api<{ gating: string; items: MilestoneDTO[] }>(`/jobs/${jobId}/milestones`) });
  const waivers = useQuery({ queryKey: ["jobs", jobId, "waivers"], queryFn: () => api<{ items: WaiverDTO[] }>(`/jobs/${jobId}/waivers`) });

  return (
    <div className="space-y-8">
      <PartiesSection jobId={jobId} parties={parties.data?.items ?? []} />

      <section aria-labelledby="pay" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="pay" className="text-2xl font-bold">Payments and waivers</h2>
          {can("payment:request") && !adding && <button className="btn btn-primary" onClick={() => setAdding(true)}>Add payment</button>}
        </div>
        {adding && <NewMilestone jobId={jobId} onDone={() => setAdding(false)} />}
        {milestones.data?.items.length === 0 && !adding && <p className="panel p-5 text-mist">No payments yet. Add the deposit, each progress draw and the final payment, then request waivers for each.</p>}
        {milestones.data?.items.map((m) => (
          <MilestoneCard key={m.id} jobId={jobId} m={m} parties={parties.data?.items ?? []} waivers={waivers.data?.items ?? []} gating={milestones.data!.gating} />
        ))}
      </section>
    </div>
  );
}
