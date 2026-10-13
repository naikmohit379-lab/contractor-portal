"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { PO_STATUS_LABELS, PO_TRANSITIONS, type POStatus, type PurchaseOrderDTO, type SupplierDTO } from "@roofdesk/shared";
import { api, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, usd } from "@/lib/format";

type Line = { key: string; description: string; unit: string; quantity: number; sku?: string; unitPriceCents?: number };

function NewOrder({ jobId, suppliers, onDone }: { jobId: string; suppliers: SupplierDTO[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("morning");
  const [drop, setDrop] = useState("");

  const list = useQuery({
    queryKey: ["jobs", jobId, "material-list", supplierId],
    queryFn: () => api<{ lines: Line[] }>(`/jobs/${jobId}/orders/material-list?supplierId=${supplierId}`),
    enabled: !!supplierId,
    retry: false,
  });
  const lines = (list.data?.lines ?? []).map((l) => ({ ...l, quantity: edits[l.key] ?? l.quantity })).filter((l) => l.quantity > 0);

  const create = useMutation({
    mutationFn: () => post(`/jobs/${jobId}/orders`, { supplierId, lines, deliveryWindow: date ? { date, slot } : undefined, dropInstructions: drop || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["jobs", jobId, "orders"] }); onDone(); },
  });

  return (
    <div className="panel space-y-4 p-5">
      <h3 className="text-2xl font-bold">New purchase order</h3>
      <div className="max-w-sm">
        <label className="label" htmlFor="sup">Supplier</label>
        <select id="sup" className="field" value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setEdits({}); }}>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.branch ? ` (${s.branch})` : ""}</option>)}
        </select>
      </div>

      {list.isError && <p role="alert" className="text-bad">{(list.error as Error).message}</p>}
      {list.data && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <caption className="pb-2 text-left text-mist">Material list from the current estimate. Adjust quantities before ordering.</caption>
            <thead className="text-mist"><tr><th className="pb-2 font-medium">Material</th><th className="pb-2 font-medium">SKU</th><th className="w-28 pb-2 font-medium">Quantity</th></tr></thead>
            <tbody>
              {list.data.lines.map((l) => (
                <tr key={l.key} className="border-t border-ink-600">
                  <td className="py-2 pr-3">{l.description}</td>
                  <td className="pr-3 text-mist">{l.sku ?? "Not in catalog"}</td>
                  <td>
                    <input aria-label={`${l.description} quantity`} type="number" min={0} className="field" value={edits[l.key] ?? l.quantity}
                      onChange={(e) => setEdits((m) => ({ ...m, [l.key]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))} />
                    <span className="sr-only">{l.unit}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div><label className="label" htmlFor="dd">Delivery date</label><input id="dd" type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div>
          <label className="label" htmlFor="ds">Time slot</label>
          <select id="ds" className="field" value={slot} onChange={(e) => setSlot(e.target.value)}>
            <option value="morning">Morning</option><option value="midday">Midday</option><option value="afternoon">Afternoon</option><option value="anytime">Anytime</option>
          </select>
        </div>
        <div className="sm:col-span-3"><label className="label" htmlFor="dr">Drop instructions</label><input id="dr" className="field" placeholder="Where to place the roof load, gate codes, access" value={drop} onChange={(e) => setDrop(e.target.value)} /></div>
      </div>
      {create.isError && <p role="alert" className="text-bad">{(create.error as Error).message}</p>}
      <div className="flex gap-3">
        <button className="btn btn-primary" disabled={create.isPending || lines.length === 0} onClick={() => create.mutate()}>{create.isPending ? "Creating order" : "Create draft order"}</button>
        <button className="btn btn-ghost" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

function OrderCard({ jobId, order, supplier }: { jobId: string; order: PurchaseOrderDTO; supplier?: SupplierDTO }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [link, setLink] = useState<string | null>(null);
  const [emailedTo, setEmailedTo] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["jobs", jobId] }); qc.invalidateQueries({ queryKey: ["jobs", "summary"] }); };

  const send = useMutation({
    mutationFn: () => post<{ order: PurchaseOrderDTO; confirmUrl: string; emailedTo?: string }>(`/jobs/${jobId}/orders/${order.id}/send`),
    onSuccess: (r) => { setLink(r.confirmUrl); setEmailedTo(r.emailedTo ?? null); refresh(); },
  });
  const move = useMutation({ mutationFn: (status: POStatus) => post(`/jobs/${jobId}/orders/${order.id}/status`, { status }), onSuccess: refresh });
  const next = PO_TRANSITIONS[order.status].filter((s) => s !== "sent");

  const mailto = link && supplier?.contactEmail
    ? `mailto:${supplier.contactEmail}?subject=${encodeURIComponent(`Purchase order ${order.poNumber}`)}&body=${encodeURIComponent(`Please review and confirm this order, including your delivery window:\n${link}`)}`
    : null;

  return (
    <article className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold">{order.poNumber} <span className="font-sans text-base font-normal normal-case text-mist">{order.supplierName}</span></h3>
          <p className="text-sm text-mist">
            {order.deliveryWindow ? `Delivery ${fmtDate(order.deliveryWindow.date)}, ${order.deliveryWindow.slot}` : "No delivery date yet"}
            {order.totalCents > 0 && ` | ${usd(order.totalCents)}`}
          </p>
        </div>
        <span className="rounded bg-ember/15 px-3 py-1 text-sm font-semibold text-ember-300">{PO_STATUS_LABELS[order.status]}</span>
      </div>

      <ul className="mt-3 divide-y divide-ink-600 text-sm">
        {order.lines.map((l) => (
          <li key={l.key} className="flex justify-between gap-3 py-2"><span>{l.description}{l.sku && <span className="ml-2 text-mist">{l.sku}</span>}</span><span className="whitespace-nowrap font-medium">{l.quantity} {l.unit}</span></li>
        ))}
      </ul>
      {order.dropInstructions && <p className="mt-3 text-sm text-mist">Drop: {order.dropInstructions}</p>}

      {can("order:send") && (
        <div className="mt-4 flex flex-wrap gap-2">
          {order.status === "draft" && <button className="btn btn-primary" disabled={send.isPending} onClick={() => send.mutate()}>{send.isPending ? "Sending" : "Send order"}</button>}
          {next.map((s) => (
            <button key={s} className="btn btn-ghost" disabled={move.isPending} onClick={() => (s !== "cancelled" || confirm("Cancel this order?")) && move.mutate(s)}>
              {s === "delivered" ? "Mark delivered" : s === "cancelled" ? "Cancel order" : `Mark ${PO_STATUS_LABELS[s].toLowerCase()}`}
            </button>
          ))}
        </div>
      )}
      {(send.isError || move.isError) && <p role="alert" className="mt-3 text-sm text-bad">{((send.error || move.error) as Error).message}</p>}

      {link && (
        <div className="mt-4 space-y-2 rounded-md border border-ember/40 bg-ember/10 p-3 text-sm">
          <p className="font-medium">{emailedTo ? `Order sent and emailed to ${emailedTo}.` : "Order sent."} {emailedTo ? "The link is below if you need it too." : "Share this link with the supplier so they can confirm and set the delivery window."}</p>
          <div className="flex flex-wrap gap-2">
            <input readOnly aria-label="Supplier confirmation link" className="field flex-1" value={link} onFocus={(e) => e.currentTarget.select()} />
            <button className="btn btn-ghost" onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); }}>{copied ? "Copied" : "Copy link"}</button>
            {mailto && <a className="btn btn-ghost" href={mailto}>Email supplier</a>}
          </div>
          <p className="text-mist">This link is shown once. Anyone with it can answer this order.</p>
        </div>
      )}

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-mist-strong">Order history</summary>
        <ol className="mt-2 space-y-1">{[...order.statusHistory].reverse().map((h, i) => <li key={i} className="text-mist">{PO_STATUS_LABELS[h.to]} | {fmtDate(h.at)}{h.by === "supplier" && " | by supplier"}{h.note && ` | ${h.note}`}</li>)}</ol>
      </details>
    </article>
  );
}

export function OrdersTab({ jobId }: { jobId: string }) {
  const { can } = useAuth();
  const [creating, setCreating] = useState(false);
  const orders = useQuery({ queryKey: ["jobs", jobId, "orders"], queryFn: () => api<{ items: PurchaseOrderDTO[] }>(`/jobs/${jobId}/orders`) });
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: () => api<{ items: SupplierDTO[] }>("/suppliers") });

  return (
    <section aria-label="Supplier orders" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Supplier orders</h2>
        {can("order:send") && !creating && (suppliers.data?.items.length ?? 0) > 0 && <button className="btn btn-primary" onClick={() => setCreating(true)}>New purchase order</button>}
      </div>
      {suppliers.data?.items.length === 0 && (
        <p className="panel p-5 text-mist">Add a supplier first. <Link href="/suppliers" className="font-semibold text-ember">Go to Suppliers</Link></p>
      )}
      {creating && suppliers.data && <NewOrder jobId={jobId} suppliers={suppliers.data.items} onDone={() => setCreating(false)} />}
      {orders.data?.items.length === 0 && !creating && (suppliers.data?.items.length ?? 0) > 0 && <p className="panel p-5 text-mist">No orders yet. Create a purchase order from the approved estimate.</p>}
      {orders.data?.items.map((o) => <OrderCard key={o.id} jobId={jobId} order={o} supplier={suppliers.data?.items.find((s) => s.id === o.supplierId)} />)}
    </section>
  );
}
