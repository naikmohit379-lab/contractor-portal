"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import type { PublicWaiverDTO } from "@roofdesk/shared";
import { Logo } from "@/components/Logo";
import { SignaturePad } from "@/components/SignaturePad";
import { ApiError, api, post } from "@/lib/api";
import { fmtDate, fmtDateTime, usd } from "@/lib/format";

export default function SignWaiverPage() {
  const { token } = useParams<{ token: string }>();
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ kind: "signed" | "declined"; hash?: string } | null>(null);

  const q = useQuery({ queryKey: ["public-waiver", token], queryFn: () => api<PublicWaiverDTO>(`/public/waivers/${token}`), retry: false });
  const sign = useMutation({
    mutationFn: () => post<{ documentHash: string }>(`/public/waivers/${token}/sign`, { signerName: name, consent, signatureImage: signature ?? undefined }),
    onSuccess: (r) => setResult({ kind: "signed", hash: r.documentHash }),
  });
  const decline = useMutation({
    mutationFn: () => post(`/public/waivers/${token}/decline`, { reason }),
    onSuccess: () => setResult({ kind: "declined" }),
  });

  const w = q.data;
  const err = (sign.error || decline.error) as Error | null;
  const invalid = q.error instanceof ApiError && q.error.status === 404;

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className="mb-6"><Logo href="/sign" /></div>
      {q.isLoading && <p className="text-mist">Loading waiver</p>}
      {q.isError && <p role="alert" className="panel p-6 text-bad">{invalid ? "This signing link is not valid. Ask the contractor to send a new one." : "The waiver could not be loaded. Refresh to try again."}</p>}

      {w && (
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">{w.title}</h1>
            <p className="text-mist">Requested by {w.company} from {w.partyName}</p>
          </div>

          <article className="whitespace-pre-wrap rounded-xl bg-white p-6 text-[15px] leading-relaxed text-ink-900" aria-label="Waiver text">
            {w.text}
          </article>

          {result?.kind === "signed" || w.status === "signed" ? (
            <div role="status" className="space-y-2 rounded-xl bg-ok/10 p-5 text-ok">
              <p className="text-lg font-semibold">Signed. A record of this waiver has been saved.</p>
              {(result?.hash ?? w.documentHash) && <p className="break-all text-sm">Document fingerprint: {(result?.hash ?? w.documentHash)!.slice(0, 24)}</p>}
              {w.signedAt && <p className="text-sm">Signed {fmtDateTime(w.signedAt)}</p>}
            </div>
          ) : result?.kind === "declined" || w.status === "declined" ? (
            <p role="status" className="panel p-5 text-mist-strong">You declined to sign. The contractor has been told.</p>
          ) : w.status === "expired" ? (
            <p role="alert" className="panel p-5 text-warn">This link expired{w.expiresAt && ` on ${fmtDate(w.expiresAt)}`}. Ask {w.company} to send a new one.</p>
          ) : w.status === "cancelled" ? (
            <p className="panel p-5 text-mist-strong">This request was cancelled by the contractor.</p>
          ) : (
            <section className="panel space-y-5 p-5" aria-label="Sign this waiver">
              <p className="text-sm text-mist-strong">Amount {usd(w.amountCents)}, through {fmtDate(w.throughDate)}. Read the waiver above, then sign below.</p>
              <div>
                <label className="label" htmlFor="nm">Your full legal name</label>
                <input id="nm" className="field" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <p className="label">Draw your signature</p>
                <SignaturePad onChange={setSignature} />
              </div>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-0.5 h-5 w-5 accent-ember" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>I agree to sign this waiver electronically and confirm I am authorized to sign for {w.partyName}.</span>
              </label>
              {err && <p role="alert" className="text-sm text-bad">{err.message}</p>}
              <div className="flex flex-wrap gap-3">
                <button className="btn btn-primary" disabled={sign.isPending || name.trim().length < 2 || !consent} onClick={() => sign.mutate()}>{sign.isPending ? "Signing" : "Sign waiver"}</button>
                <button className="btn btn-ghost" onClick={() => setDeclining((d) => !d)}>I cannot sign</button>
              </div>
              {declining && (
                <div className="space-y-3 border-t border-ink-600 pt-4">
                  <label className="label" htmlFor="rs">Why can you not sign?</label>
                  <input id="rs" className="field" value={reason} onChange={(e) => setReason(e.target.value)} />
                  <button className="btn btn-ghost" disabled={decline.isPending || reason.trim().length < 3} onClick={() => decline.mutate()}>Send reason and decline</button>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </main>
  );
}
