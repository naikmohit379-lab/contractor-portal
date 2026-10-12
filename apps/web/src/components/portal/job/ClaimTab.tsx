"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  CLAIM_STATUS_LABELS,
  CLAIM_TRANSITIONS,
  COMM_CHANNELS,
  claimCreateSchema,
  communicationSchema,
  type ClaimCreateInput,
  type ClaimDTO,
  type ClaimStatus,
  type CommunicationDTO,
} from "@roofdesk/shared";
import { z } from "zod";
import { api, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { centsToDollars, dollarsToCents, fmtDate, fmtDateTime, usd } from "@/lib/format";

function CreateClaim({ jobId }: { jobId: string }) {
  const qc = useQueryClient();
  // The form edits the deductible in dollars; it is converted to cents before it is sent.
  const form = useForm<ClaimCreateInput & { deductible: string }>({
    resolver: zodResolver(claimCreateSchema.extend({ deductible: z.string().optional() }) as any),
    defaultValues: { deductible: "0" },
  });
  const create = useMutation({
    mutationFn: ({ deductible, ...v }: ClaimCreateInput & { deductible: string }) =>
      post<{ claim: ClaimDTO }>(`/jobs/${jobId}/claim`, { ...v, deductibleCents: dollarsToCents(parseFloat(deductible || "0") || 0) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs", jobId] });
    },
  });
  const { register, handleSubmit, formState: { errors } } = form;
  const f = (name: any, label: string, props: Record<string, string> = {}, err?: string) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} className="field" {...props} {...register(name)} />
      {err && <p className="field-error">{err}</p>}
    </div>
  );

  return (
    <form onSubmit={handleSubmit((v) => create.mutate(v))} className="panel space-y-4 p-5" noValidate>
      <h2 className="text-2xl font-bold">Start the insurance claim</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {f("carrier", "Insurance carrier", {}, errors.carrier?.message)}
        {f("policyNo", "Policy number", {}, errors.policyNo?.message)}
        {f("claimNo", "Claim number", {}, errors.claimNo?.message)}
        {f("dateOfLoss", "Date of loss", { type: "date" }, errors.dateOfLoss?.message)}
        {f("adjuster.name", "Adjuster name")}
        {f("adjuster.phone", "Adjuster phone", { type: "tel", inputMode: "tel" })}
        {f("adjuster.email", "Adjuster email", { type: "email", inputMode: "email" }, errors.adjuster?.email?.message)}
        {f("deductible", "Deductible (USD)", { inputMode: "decimal" })}
      </div>
      {create.isError && <p role="alert" className="rounded-md bg-bad/10 p-3 text-sm text-bad">{(create.error as Error).message}</p>}
      <button className="btn btn-primary" disabled={create.isPending}>{create.isPending ? "Creating claim" : "Create claim"}</button>
    </form>
  );
}

function StatusPanel({ jobId, claim }: { jobId: string; claim: ClaimDTO }) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<ClaimStatus | null>(null);
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const change = useMutation({
    mutationFn: (status: ClaimStatus) =>
      post<{ claim: ClaimDTO }>(`/jobs/${jobId}/claim/status`, {
        status,
        note: note || undefined,
        approvedAmountCents: amount ? dollarsToCents(parseFloat(amount)) : undefined,
      }),
    onSuccess: () => {
      setPending(null); setNote(""); setAmount("");
      qc.invalidateQueries({ queryKey: ["jobs", jobId] });
      qc.invalidateQueries({ queryKey: ["jobs", "summary"] });
    },
  });
  const next = CLAIM_TRANSITIONS[claim.status];
  const needsAmount = pending === "approved" || pending === "partially_approved";

  return (
    <div className="space-y-3">
      {next.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {next.map((s) => (
            <button key={s} className={pending === s ? "btn btn-primary" : "btn btn-ghost"} onClick={() => setPending(pending === s ? null : s)}>
              {s === "submitted" ? "Submit claim" : CLAIM_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      ) : <p className="text-sm text-mist">This claim is closed.</p>}
      {pending && (
        <div className="panel space-y-3 p-4">
          <p className="font-medium">Move claim to "{CLAIM_STATUS_LABELS[pending]}"</p>
          {pending === "submitted" && <p className="text-sm text-mist">Submitting locks the current estimate version, so what the carrier sees cannot change.</p>}
          {needsAmount && (
            <div className="max-w-xs">
              <label className="label" htmlFor="amt">Approved amount (USD)</label>
              <input id="amt" className="field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={centsToDollars(0)} />
            </div>
          )}
          <div>
            <label className="label" htmlFor="note">Note (optional)</label>
            <input id="note" className="field" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {change.isError && <p role="alert" className="text-sm text-bad">{(change.error as Error).message}</p>}
          <div className="flex gap-3">
            <button className="btn btn-primary" disabled={change.isPending} onClick={() => change.mutate(pending)}>Confirm</button>
            <button className="btn btn-ghost" onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Communications({ jobId }: { jobId: string }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["jobs", jobId, "comms"], queryFn: () => api<{ items: CommunicationDTO[] }>(`/jobs/${jobId}/claim/communications`) });
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.input<typeof communicationSchema>>({
    resolver: zodResolver(communicationSchema),
    defaultValues: { channel: "call", direction: "inbound" },
  });
  const add = useMutation({
    mutationFn: (v: z.input<typeof communicationSchema>) => post(`/jobs/${jobId}/claim/communications`, v),
    onSuccess: () => { reset({ channel: "call", direction: "inbound", body: "" }); qc.invalidateQueries({ queryKey: ["jobs", jobId, "comms"] }); },
  });

  return (
    <section className="space-y-3" aria-labelledby="comms">
      <h3 id="comms" className="text-xl font-bold">Adjuster communication log</h3>
      {can("claim:write") && (
        <form onSubmit={handleSubmit((v) => add.mutate(v))} className="panel space-y-3 p-4" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ch">Channel</label>
              <select id="ch" className="field" {...register("channel")}>{COMM_CHANNELS.map((c) => <option key={c} value={c}>{c[0]!.toUpperCase() + c.slice(1)}</option>)}</select>
            </div>
            <div>
              <label className="label" htmlFor="dir">Direction</label>
              <select id="dir" className="field" {...register("direction")}><option value="inbound">From adjuster</option><option value="outbound">To adjuster</option></select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="body">What was said or sent</label>
            <textarea id="body" rows={3} className="field py-2" {...register("body")} />
            {errors.body && <p className="field-error">{errors.body.message}</p>}
          </div>
          <button className="btn btn-primary" disabled={add.isPending}>Add to log</button>
        </form>
      )}
      <ul className="panel divide-y divide-ink-600">
        {list.data?.items.length === 0 && <li className="p-4 text-sm text-mist">No communication logged yet. Record every call and email with the adjuster here.</li>}
        {list.data?.items.map((c) => (
          <li key={c.id} className="p-4">
            <p className="text-xs text-mist">{fmtDateTime(c.createdAt)} | {c.channel} | {c.direction === "inbound" ? "From adjuster" : "To adjuster"}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ClaimTab({ jobId }: { jobId: string }) {
  const claimQ = useQuery({ queryKey: ["jobs", jobId, "claim"], queryFn: () => api<{ claim: ClaimDTO | null }>(`/jobs/${jobId}/claim`) });
  const { can } = useAuth();
  if (claimQ.isLoading) return <p className="text-mist">Loading claim</p>;
  const claim = claimQ.data?.claim;
  if (!claim) return can("claim:write") ? <CreateClaim jobId={jobId} /> : <p className="panel p-6 text-mist">No claim has been started for this job.</p>;

  return (
    <section aria-label="Claim" className="space-y-6">
      <div className="panel space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">{claim.carrier}</h2>
            <p className="text-sm text-mist">Claim {claim.claimNo} | Policy {claim.policyNo} | Loss on {fmtDate(claim.dateOfLoss)}</p>
          </div>
          <span className="rounded bg-ember/15 px-3 py-1 text-sm font-semibold text-ember-300">{CLAIM_STATUS_LABELS[claim.status]}</span>
        </div>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div><dt className="text-mist">Adjuster</dt><dd>{claim.adjuster.name || "Not added"}{claim.adjuster.phone && ` | ${claim.adjuster.phone}`}</dd><dd className="text-mist">{claim.adjuster.email}</dd></div>
          <div><dt className="text-mist">Deductible</dt><dd>{usd(claim.deductibleCents)}</dd></div>
          <div><dt className="text-mist">Carrier approved amount</dt><dd>{claim.approvedAmountCents !== undefined ? usd(claim.approvedAmountCents) : "Not set"}</dd></div>
        </dl>
        {can("claim:write") && <StatusPanel jobId={jobId} claim={claim} />}
        <Link href={`/jobs/${jobId}/packet`} className="btn btn-ghost">Open claim packet</Link>
      </div>

      <section aria-labelledby="hist">
        <h3 id="hist" className="mb-2 text-xl font-bold">Status history</h3>
        <ol className="panel divide-y divide-ink-600">
          {[...claim.statusHistory].reverse().map((h, i) => (
            <li key={i} className="p-3 text-sm">
              <span className="font-medium">{CLAIM_STATUS_LABELS[h.to]}</span> <span className="text-mist">{fmtDateTime(h.at)}</span>
              {h.note && <p className="text-mist-strong">{h.note}</p>}
            </li>
          ))}
        </ol>
      </section>

      <Communications jobId={jobId} />
    </section>
  );
}
