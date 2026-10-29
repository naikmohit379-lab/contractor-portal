"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ClaimDTO, CommunicationDTO, DocumentDTO, EstimateVersionDTO, JobDTO } from "@roofdesk/shared";
import { AuthImage } from "@/components/AuthImage";
import { CLAIM_STATUS_LABELS, MARKER_LABELS } from "@roofdesk/shared";
import { api } from "@/lib/api";
import { fmtDate, fmtDateTime, usd } from "@/lib/format";

interface Packet {
  job: JobDTO;
  claim: ClaimDTO;
  estimate: EstimateVersionDTO;
  measurement: { totals: { areaSqFt: number; squares: number; wastePct: number }; linear: Record<string, number>; facets: { id: string; areaSqFt: number; pitch: string }[]; imageryDate?: string } | null;
  communications: CommunicationDTO[];
  photos: DocumentDTO[];
}

/**
 * Printable claim packet. Use the browser's Print > Save as PDF.
 * Server-side PDF generation with a Chromium worker is planned (architecture section 8.2).
 */
export default function PacketPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const q = useQuery({ queryKey: ["jobs", jobId, "packet"], queryFn: () => api<Packet>(`/jobs/${jobId}/claim/packet`), retry: false });

  if (q.isLoading) return <p className="text-mist">Building packet</p>;
  if (q.isError || !q.data) return (
    <div className="space-y-3">
      <p role="alert" className="text-bad">{(q.error as Error)?.message ?? "The packet could not be built."}</p>
      <Link href={`/jobs/${jobId}?tab=claim`} className="btn btn-ghost">Back to claim</Link>
    </div>
  );
  const { job, claim, estimate: e, measurement: m, communications, photos } = q.data;

  return (
    <div className="space-y-4">
      <div className="flex gap-3 print:hidden">
        <Link href={`/jobs/${jobId}?tab=claim`} className="btn btn-ghost">Back to claim</Link>
        <button className="btn btn-primary" onClick={() => window.print()}>Print or save as PDF</button>
      </div>

      <article className="space-y-8 rounded-xl bg-white p-8 text-ink-900 print:rounded-none print:p-0">
        <header className="border-b-2 border-ink-900 pb-4">
          <h1 className="text-4xl font-bold">Insurance claim packet</h1>
          <p className="mt-1 text-sm">{job.customer.name} | {[job.property.line1, job.property.line2, job.property.locality, job.property.city, job.property.district, job.property.state, job.property.country === "IN" ? job.property.pinCode : job.property.zip].filter(Boolean).join(", ")}</p>
        </header>

        <section>
          <h2 className="mb-2 text-2xl font-bold">Claim details</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            {[["Carrier", claim.carrier], ["Claim number", claim.claimNo], ["Policy number", claim.policyNo], ["Date of loss", fmtDate(claim.dateOfLoss)], ["Status", CLAIM_STATUS_LABELS[claim.status]], ["Adjuster", claim.adjuster.name || "Not assigned"]].map(([k, v]) => (
              <div key={k}><dt className="text-xs text-ink-500">{k}</dt><dd className="font-medium">{v}</dd></div>
            ))}
          </dl>
        </section>

        {m && (
          <section>
            <h2 className="mb-2 text-2xl font-bold">Roof measurements</h2>
            <p className="text-sm">Total area {m.totals.areaSqFt.toLocaleString()} sq ft ({m.totals.squares} squares), waste factor {m.totals.wastePct}%. {m.imageryDate && `Aerial imagery dated ${fmtDate(m.imageryDate)}.`}</p>
            <table className="mt-2 w-full text-left text-sm"><thead><tr className="border-b border-ink-600"><th className="py-1">Facet</th><th>Area (sq ft)</th><th>Pitch</th></tr></thead>
              <tbody>{m.facets.map((f) => <tr key={f.id} className="border-b border-ink-500/30"><td className="py-1">{f.id}</td><td>{f.areaSqFt.toLocaleString()}</td><td>{f.pitch}</td></tr>)}</tbody></table>
            <p className="mt-2 text-sm">{Object.entries(m.linear).map(([k, v]) => `${k[0]!.toUpperCase()}${k.slice(1)} ${v} ft`).join(" | ")}</p>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-2xl font-bold">Estimate (version {e.versionNo})</h2>
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-ink-600"><th className="py-1">Item</th><th>Qty</th><th>Unit price</th><th className="text-right">Total</th></tr></thead>
            <tbody>{e.lineItems.map((i) => <tr key={i.key} className="border-b border-ink-500/30"><td className="py-1">{i.description}</td><td>{i.quantity} {i.unit}</td><td>{usd(i.unitPriceCents)}</td><td className="text-right">{usd(Math.round(i.quantity * i.unitPriceCents))}</td></tr>)}</tbody>
          </table>
          <dl className="ml-auto mt-3 w-full max-w-xs space-y-1 text-sm">
            {([["Subtotal", e.totals.subtotalCents], ["Overhead", e.totals.overheadCents], ["Profit", e.totals.profitCents], ["Tax", e.totals.taxCents], ["Replacement cost (RCV)", e.totals.rcvCents], ["Depreciation", -e.totals.depreciationCents], ["Actual cash value (ACV)", e.totals.acvCents], ["Deductible", -e.settings.deductibleCents]] as [string, number][]).map(([k, v]) => (
              <div key={k} className="flex justify-between"><dt>{k}</dt><dd>{usd(v)}</dd></div>
            ))}
            <div className="flex justify-between border-t-2 border-ink-900 pt-1 text-base font-bold"><dt>Net claim</dt><dd>{usd(e.totals.netClaimCents)}</dd></div>
          </dl>
        </section>

        {photos.length > 0 && (
          <section>
            <h2 className="mb-2 text-2xl font-bold">Photo evidence</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {photos.map((p, n) => (
                <figure key={p.id} className="break-inside-avoid">
                  <AuthImage doc={p} markers className="w-full rounded border border-ink-500/30" />
                  <figcaption className="mt-1 text-sm">
                    <span className="font-medium">Photo {n + 1}{p.slope ? `, ${p.slope} slope` : ""}</span>{p.caption && `: ${p.caption}`}
                    {p.annotations.length > 0 && <ol className="mt-1 list-inside list-decimal text-xs">{p.annotations.map((a) => <li key={a.id}>{MARKER_LABELS[a.kind]}{a.note && `: ${a.note}`}</li>)}</ol>}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {communications.length > 0 && (
          <section>
            <h2 className="mb-2 text-2xl font-bold">Adjuster communication</h2>
            <ul className="space-y-2 text-sm">{communications.map((c) => <li key={c.id}><span className="text-xs text-ink-500">{fmtDateTime(c.createdAt)} | {c.channel} | {c.direction === "inbound" ? "From adjuster" : "To adjuster"}</span><br />{c.body}</li>)}</ul>
          </section>
        )}
      </article>
    </div>
  );
}
