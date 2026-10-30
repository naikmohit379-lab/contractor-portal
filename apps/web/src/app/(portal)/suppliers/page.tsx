"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { MATERIAL_KEYS, MATERIAL_LABELS } from "@roofdesk/estimate-engine";
import { supplierSchema, type SupplierDTO, type SupplierInput } from "@roofdesk/shared";
import { NumInput } from "@/components/NumInput";
import { api, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { centsToDollars, dollarsToCents } from "@/lib/format";

type CatalogRow = SupplierDTO["catalog"][number];

function CatalogEditor({ supplier }: { supplier: SupplierDTO }) {
  const qc = useQueryClient();
  const { can, user } = useAuth();
  const [rows, setRows] = useState<CatalogRow[]>(supplier.catalog);
  const save = useMutation({
    mutationFn: () => api<SupplierDTO>(`/suppliers/${supplier.id}/catalog`, { method: "PUT", body: JSON.stringify({ items: rows }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
  const editable = can("order:send");
  const set = (i: number, p: Partial<CatalogRow>) => setRows((r) => r.map((x, idx) => (idx === i ? { ...x, ...p } : x)));

  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-mist">Map our materials to this supplier's SKUs and prices. Purchase orders use these when you create them.</p>
      {rows.map((r, i) => (
        <div key={i} className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1.4fr_.8fr_auto]">
          <select aria-label="Material" className="field" value={r.materialKey} disabled={!editable} onChange={(e) => set(i, { materialKey: e.target.value })}>
            {MATERIAL_KEYS.map((k) => <option key={k} value={k}>{MATERIAL_LABELS[k]}</option>)}
          </select>
          <input aria-label="SKU" placeholder="SKU" className="field" value={r.sku} disabled={!editable} onChange={(e) => set(i, { sku: e.target.value })} />
          <input aria-label="Product name" placeholder="Product name" className="field" value={r.name} disabled={!editable} onChange={(e) => set(i, { name: e.target.value })} />
          <NumInput aria-label={`Unit price (${user?.company.settings?.currency ?? "INR"})`} value={r.unitPriceCents} disabled={!editable} format={(c) => centsToDollars(c)} parse={(s) => dollarsToCents(parseFloat(s))} onCommit={(c) => set(i, { unitPriceCents: c })} />
          {editable && <button className="btn btn-ghost px-3" aria-label="Remove row" onClick={() => setRows((a) => a.filter((_, x) => x !== i))}><Trash2 size={16} /></button>}
        </div>
      ))}
      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-ghost" onClick={() => setRows((r) => [...r, { materialKey: MATERIAL_KEYS[0]!, sku: "", name: "", unitPriceCents: 0 }])}><Plus size={16} aria-hidden /> Add product</button>
          <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving" : "Save catalog"}</button>
          {save.isSuccess && <span className="text-sm text-ok">Catalog saved</span>}
          {save.isError && <span role="alert" className="text-sm text-bad">{(save.error as Error).message}</span>}
        </div>
      )}
    </div>
  );
}

function NewSupplier({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<SupplierInput>({ resolver: zodResolver(supplierSchema) });
  const create = useMutation({ mutationFn: (v: SupplierInput) => post("/suppliers", v), onSuccess: () => { qc.invalidateQueries({ queryKey: ["suppliers"] }); onDone(); } });
  const f = (name: keyof SupplierInput, label: string, props: Record<string, string> = {}) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} className="field" {...props} {...register(name)} />
      {errors[name] && <p className="field-error">{errors[name]?.message as string}</p>}
    </div>
  );
  return (
    <form onSubmit={handleSubmit((v) => create.mutate(v))} className="panel space-y-4 p-5" noValidate>
      <h2 className="text-2xl font-bold">New supplier</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {f("name", "Supplier name")}{f("branch", "Branch")}{f("accountNumber", "Your account number")}{f("contactName", "Contact name")}
        {f("contactEmail", "Contact email", { type: "email", inputMode: "email" })}{f("contactPhone", "Contact phone", { type: "tel", inputMode: "tel" })}
      </div>
      {create.isError && <p role="alert" className="text-sm text-bad">{(create.error as Error).message}</p>}
      <div className="flex gap-3"><button className="btn btn-primary" disabled={create.isPending}>Save supplier</button><button type="button" className="btn btn-ghost" onClick={onDone}>Cancel</button></div>
    </form>
  );
}

export default function SuppliersPage() {
  const { can } = useAuth();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: () => api<{ items: SupplierDTO[] }>("/suppliers") });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-4xl font-bold">Suppliers</h1>
        {can("order:send") && !creating && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={18} aria-hidden /> New supplier</button>}
      </div>
      {creating && <NewSupplier onDone={() => setCreating(false)} />}
      {suppliers.data?.items.length === 0 && !creating && <p className="panel p-6 text-mist">No suppliers yet. Add your distributor branch to start ordering materials from estimates.</p>}
      {suppliers.data?.items.map((s) => (
        <article key={s.id} className="panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">{s.name}{s.branch && <span className="font-sans text-base font-normal normal-case text-mist"> {s.branch}</span>}</h2>
              <p className="text-sm text-mist">{[s.contactName, s.contactEmail, s.contactPhone, s.accountNumber && `Acct ${s.accountNumber}`].filter(Boolean).join(" | ") || "No contact details yet"}</p>
            </div>
            <button className="btn btn-ghost" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? "Hide catalog" : `Catalog (${s.catalog.length})`}</button>
          </div>
          {open === s.id && <CatalogEditor supplier={s} />}
        </article>
      ))}
    </div>
  );
}
