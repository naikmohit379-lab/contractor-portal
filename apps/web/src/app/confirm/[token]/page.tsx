"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { api, post } from "@/lib/api";
import { fmtDate } from "@/lib/format";

interface PublicOrder {
  poNumber: string;
  status: string;
  company?: string;
  supplier?: string;
  accountNumber?: string;
  deliverTo?: string;
  dropInstructions?: string;
  requestedWindow?: { date: string; slot: string };
  lines: { description: string; unit: string; quantity: number; sku?: string }[];
}

export default function ConfirmOrderPage() {
  const { token } = useParams<{ token: string }>();
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("morning");
  const [note, setNote] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const order = useQuery({ queryKey: ["public-order", token], queryFn: () => api<PublicOrder>(`/public/orders/${token}`), retry: false });
  const respond = useMutation({
    mutationFn: (action: "confirm" | "backorder") =>
      post<{ status: string }>(`/public/orders/${token}/respond`, { action, deliveryWindow: action === "confirm" && date ? { date, slot } : undefined, note: note || undefined }),
    onSuccess: (r) => setDone(r.status),
  });

  const o = order.data;
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-10">
      <div className="mb-8"><Logo href="/confirm" /></div>
      {order.isLoading && <p className="text-mist">Loading order</p>}
      {order.isError && <p role="alert" className="panel p-6 text-bad">This link is not valid. Ask the contractor to send the order again.</p>}
      {o && (
        <div className="panel space-y-5 p-6">
          <div>
            <h1 className="text-3xl font-bold">Purchase order {o.poNumber}</h1>
            <p className="text-mist">From {o.company}{o.supplier && ` to ${o.supplier}`}{o.accountNumber && ` | Account ${o.accountNumber}`}</p>
          </div>
          {o.deliverTo && <p><span className="text-mist">Deliver to:</span> {o.deliverTo}</p>}
          {o.requestedWindow && <p><span className="text-mist">Requested delivery:</span> {fmtDate(o.requestedWindow.date)}, {o.requestedWindow.slot}</p>}
          {o.dropInstructions && <p><span className="text-mist">Drop instructions:</span> {o.dropInstructions}</p>}
          <ul className="divide-y divide-ink-600 text-sm">
            {o.lines.map((l, i) => <li key={i} className="flex justify-between gap-3 py-2"><span>{l.description}{l.sku && <span className="ml-2 text-mist">{l.sku}</span>}</span><span className="font-medium">{l.quantity} {l.unit}</span></li>)}
          </ul>

          {done ? (
            <p role="status" className="rounded-md bg-ok/10 p-4 text-ok">Thank you. The order is now marked "{done.replace("_", " ")}" and the contractor has been updated.</p>
          ) : o.status !== "sent" ? (
            <p className="rounded-md bg-ink-700 p-4 text-mist-strong">This order has already been answered (status: {o.status.replace("_", " ")}).</p>
          ) : (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Your response</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className="label" htmlFor="d">Delivery date</label><input id="d" type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} /></div>
                <div><label className="label" htmlFor="s">Time slot</label>
                  <select id="s" className="field" value={slot} onChange={(e) => setSlot(e.target.value)}><option value="morning">Morning</option><option value="midday">Midday</option><option value="afternoon">Afternoon</option><option value="anytime">Anytime</option></select>
                </div>
              </div>
              <div><label className="label" htmlFor="n">Note (optional)</label><input id="n" className="field" value={note} onChange={(e) => setNote(e.target.value)} /></div>
              {respond.isError && <p role="alert" className="text-sm text-bad">{(respond.error as Error).message}</p>}
              <div className="flex flex-wrap gap-3">
                <button className="btn btn-primary" disabled={respond.isPending} onClick={() => respond.mutate("confirm")}>Confirm order</button>
                <button className="btn btn-ghost" disabled={respond.isPending} onClick={() => respond.mutate("backorder")}>Items are backordered</button>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
