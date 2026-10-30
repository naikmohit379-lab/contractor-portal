"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import type { PublicPaymentDTO } from "@roofdesk/shared";
import { Logo } from "@/components/Logo";
import { ApiError, api, post } from "@/lib/api";
import { fmtDateTime, usd } from "@/lib/format";

function PayPage() {
  const { token } = useParams<{ token: string }>();
  const returned = useSearchParams().get("returned") === "1";
  const q = useQuery({
    queryKey: ["public-payment", token],
    queryFn: () => api<PublicPaymentDTO>(`/public/payments/${token}`),
    retry: false,
    // After coming back from the gateway the final status arrives by webhook, so keep checking briefly.
    refetchInterval: (query) => (returned && ["requested", "pending"].includes(query.state.data?.status ?? "") ? 3000 : false),
  });
  const checkout = useMutation({
    mutationFn: () => post<{ url: string }>(`/public/payments/${token}/checkout`),
    onSuccess: (r) => { window.location.href = r.url; },
  });
  const p = q.data;
  const notFound = q.error instanceof ApiError && q.error.status === 404;

  return (
    <main className="mx-auto min-h-screen max-w-lg px-5 py-10">
      <div className="mb-8"><Logo href="/pay" /></div>
      {q.isLoading && <p className="text-mist">Loading payment</p>}
      {q.isError && <p role="alert" className="panel p-6 text-bad">{notFound ? "This payment link is not valid. Ask the contractor to send a new one." : "The payment could not be loaded. Refresh to try again."}</p>}
      {p && (
        <div className="panel space-y-5 p-6">
          <div>
            <p className="text-sm text-mist">{p.company}</p>
            <h1 className="text-3xl font-bold">{p.description}</h1>
          </div>
          <p className="font-display text-5xl font-bold">{usd(p.amountCents, { currency: p.currency, locale: p.locale })}</p>
          <p className="text-sm text-mist">For {p.payerName}</p>

          {p.status === "succeeded" || p.status === "partially_refunded" || p.status === "refunded" ? (
            <p role="status" className="rounded-md bg-ok/10 p-4 text-ok">Paid{p.paidAt && ` on ${fmtDateTime(p.paidAt, { currency: p.currency, locale: p.locale, timezone: p.timezone })}`}. Thank you.</p>
          ) : p.status === "canceled" ? (
            <p className="rounded-md bg-ink-700 p-4 text-mist-strong">This payment request was canceled by the contractor.</p>
          ) : (
            <div className="space-y-4">
              {p.status === "pending" && <p role="status" className="rounded-md bg-sky-400/10 p-3 text-sm text-sky-300">Your payment is being processed. Bank payments can take a few days to confirm.</p>}
              {returned && p.status === "requested" && <p role="status" className="rounded-md bg-warn/10 p-3 text-sm text-warn">Checking your payment with the bank. This page updates on its own.</p>}
              {p.status === "failed" && <p role="alert" className="rounded-md bg-bad/10 p-3 text-sm text-bad">The last attempt did not go through. You can try again.</p>}
              {checkout.isError && <p role="alert" className="text-sm text-bad">{(checkout.error as Error).message}</p>}
              <button className="btn btn-primary w-full" disabled={checkout.isPending || p.status === "pending"} onClick={() => checkout.mutate()}>{checkout.isPending ? "Opening secure checkout" : p.status === "failed" ? "Try again" : "Pay securely"}</button>
              <p className="flex items-start gap-2 text-xs text-mist"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-ember" aria-hidden /> You enter your card or bank details on the payment processor's secure page. {p.company} and this site never see or store them.</p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

export default function PayPageWrapper() {
  return <Suspense fallback={<p className="p-8 text-mist">Loading payment</p>}><PayPage /></Suspense>;
}
