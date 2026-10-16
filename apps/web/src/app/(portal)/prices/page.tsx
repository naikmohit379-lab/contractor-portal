"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { UNITS, parseCsv, priceListFromCsv, slugifyKey, toCsv, type PriceListDTO } from "@roofdesk/shared";
import { NumInput } from "@/components/NumInput";
import { api, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { centsToDollars, dollarsToCents } from "@/lib/format";

type Item = PriceListDTO["items"][number];

/** New rows get a temporary key; real ones are made from the description when saving, kept unique. */
function finalizeKeys(items: Item[]): Item[] {
  const used = new Set(items.filter((i) => !i.key.startsWith("new_")).map((i) => i.key));
  return items.map((i) => {
    if (!i.key.startsWith("new_")) return i;
    const base = slugifyKey(i.description) || "item";
    let key = base, n = 2;
    while (used.has(key)) key = `${base}_${n++}`;
    used.add(key);
    return { ...i, key };
  });
}

function Editor({ list }: { list: PriceListDTO }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [items, setItems] = useState<Item[]>(list.items);
  const [importErrors, setImportErrors] = useState<{ row: number; message: string }[]>([]);
  const [importNote, setImportNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const editable = can("estimate:write");
  const dirty = JSON.stringify(items) !== JSON.stringify(list.items);

  const refresh = () => { qc.invalidateQueries({ queryKey: ["price-list"] }); };
  const save = useMutation({ mutationFn: () => api<PriceListDTO>("/price-lists/active", { method: "PUT", body: JSON.stringify({ items: finalizeKeys(items) }) }), onSuccess: refresh });
  const reset = useMutation({ mutationFn: () => post<PriceListDTO>("/price-lists/reset"), onSuccess: refresh });
  const set = (i: number, p: Partial<Item>) => setItems((arr) => arr.map((x, idx) => (idx === i ? { ...x, ...p } : x)));

  async function importFile(file: File | undefined) {
    if (!file) return;
    setImportErrors([]); setImportNote(null);
    const result = priceListFromCsv(parseCsv(await file.text()));
    if (result.errors.length) return setImportErrors(result.errors.slice(0, 15));
    setItems(result.items);
    setImportNote(`Read ${result.items.length} items from ${file.name}. Review them, then save. Nothing changes until you save.`);
  }

  function exportFile() {
    const rows = [["key", "description", "category", "unit", "unit_price", "taxable"], ...items.map((i) => [i.key, i.description, i.category, i.unit, (i.unitPriceCents / 100).toFixed(2), i.taxable ? "yes" : "no"])];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + toCsv(rows)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `price-list-v${list.version}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold">Price list</h1>
          <p className="text-sm text-mist">Version {list.version}{list.isDefault ? ", the standard starting prices" : ""}. New estimates use these prices. Estimates already made keep theirs.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ""; }} />
          {editable && <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}><Upload size={16} aria-hidden /> Import CSV</button>}
          <button className="btn btn-ghost" onClick={exportFile}><Download size={16} aria-hidden /> Export CSV</button>
        </div>
      </div>

      {importErrors.length > 0 && (
        <div role="alert" className="panel space-y-1 border-bad/50 p-4 text-sm">
          <p className="font-semibold text-bad">The file was not imported. Fix these rows and try again:</p>
          <ul className="list-disc pl-5 text-mist-strong">{importErrors.map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}</ul>
        </div>
      )}
      {importNote && <p role="status" className="rounded-md bg-ok/10 p-3 text-sm text-ok">{importNote}</p>}
      <p className="text-sm text-mist">CSV columns: description, unit, unit price (required), plus category, taxable (yes or no) and key (optional). Units: {UNITS.join(", ")}.</p>

      <div className="panel p-4">
        <div className="hidden gap-3 px-1 pb-2 text-xs text-mist md:grid md:grid-cols-[2.4fr_1fr_.7fr_1fr_.5fr_2rem]"><span>Description</span><span>Category</span><span>Unit</span><span>Price (USD)</span><span>Tax</span><span /></div>
        <ul className="divide-y divide-ink-600">
          {items.map((it, idx) => (
            <li key={it.key} className="grid gap-3 py-3 md:grid-cols-[2.4fr_1fr_.7fr_1fr_.5fr_2rem] md:items-center">
              <div><label className="label md:sr-only" htmlFor={`pd-${it.key}`}>Description</label><input id={`pd-${it.key}`} className="field" disabled={!editable} value={it.description} onChange={(e) => set(idx, { description: e.target.value })} /></div>
              <div><label className="label md:sr-only" htmlFor={`pc-${it.key}`}>Category</label><input id={`pc-${it.key}`} className="field" disabled={!editable} value={it.category} onChange={(e) => set(idx, { category: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3 md:contents">
                <div><label className="label md:sr-only" htmlFor={`pu-${it.key}`}>Unit</label><select id={`pu-${it.key}`} className="field" disabled={!editable} value={it.unit} onChange={(e) => set(idx, { unit: e.target.value as Item["unit"] })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></div>
                <div><label className="label md:sr-only" htmlFor={`pp-${it.key}`}>Price (USD)</label><NumInput id={`pp-${it.key}`} value={it.unitPriceCents} disabled={!editable} format={(c) => centsToDollars(c)} parse={(s) => dollarsToCents(parseFloat(s))} onCommit={(c) => set(idx, { unitPriceCents: c })} /></div>
              </div>
              <label className="flex min-h-[44px] items-center gap-2 text-sm md:justify-center"><input type="checkbox" className="h-5 w-5 accent-ember" disabled={!editable} checked={it.taxable} onChange={(e) => set(idx, { taxable: e.target.checked })} /><span className="md:sr-only">Taxable</span></label>
              {editable ? <button className="btn btn-ghost h-10 min-h-0 px-2" aria-label={`Remove ${it.description || "item"}`} onClick={() => setItems((a) => a.filter((_, i) => i !== idx))}><Trash2 size={16} /></button> : <span />}
            </li>
          ))}
        </ul>
        {editable && <button className="btn btn-ghost mt-3" onClick={() => setItems((a) => [...a, { key: `new_${Date.now().toString(36)}`, description: "", category: "General", unit: "EA", unitPriceCents: 0, taxable: true }])}><Plus size={16} aria-hidden /> Add item</button>}
      </div>

      {(save.isError || reset.isError) && <p role="alert" className="text-sm text-bad">{((save.error || reset.error) as Error).message}</p>}
      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving" : "Save as new version"}</button>
          <button className="btn btn-ghost" disabled={reset.isPending} onClick={() => confirm("Replace your prices with the standard starting prices? This saves a new version; the old one is kept.") && reset.mutate()}>Reset to standard prices</button>
          {dirty && <span className="text-sm text-warn">Unsaved changes</span>}
        </div>
      )}
    </div>
  );
}

export default function PricesPage() {
  const q = useQuery({ queryKey: ["price-list"], queryFn: () => api<PriceListDTO>("/price-lists/active") });
  if (q.isLoading) return <p className="text-mist">Loading price list</p>;
  if (q.isError || !q.data) return <p role="alert" className="text-bad">The price list could not be loaded.</p>;
  return <Editor key={q.data.version} list={q.data} />;
}
