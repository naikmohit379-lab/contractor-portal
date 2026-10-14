"use client";

import clsx from "clsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { computeTotals, diffVersions } from "@roofdesk/estimate-engine";
import type { EstimateDTO, EstimateSettingsInput, EstimateVersionDTO, LineItemInput, MeasurementDTO, PriceListDTO } from "@roofdesk/shared";
import { UNITS } from "@roofdesk/shared";
import { NumInput } from "@/components/NumInput";
import { api, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { centsToDollars, dollarsToCents, usd } from "@/lib/format";

const KIND_LABEL = { original: "Original", approved: "Carrier approved", supplement: "Supplement" } as const;

function VersionEditor({ version, onSave, saving, canEdit, priceItems }: { version: EstimateVersionDTO; onSave: (items: LineItemInput[], s: EstimateSettingsInput) => void; saving: boolean; canEdit: boolean; priceItems: PriceListDTO["items"] }) {
  const [items, setItems] = useState<LineItemInput[]>(version.lineItems);
  const [settings, setSettings] = useState<EstimateSettingsInput>(version.settings);
  const locked = !!version.lockedAt;
  const editable = canEdit && !locked;
  const totals = useMemo(() => computeTotals(items, settings), [items, settings]);
  const dirty = JSON.stringify([items, settings]) !== JSON.stringify([version.lineItems, version.settings]);

  const setItem = (idx: number, patch: Partial<LineItemInput>) => setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const addLine = () =>
    setItems((arr) => [...arr, { key: `custom_${Date.now().toString(36)}`, description: "", category: "Custom", unit: "EA", quantity: 1, unitPriceCents: 0, taxable: true, depreciationPct: 0 }]);

  const summary: [string, number, boolean?][] = [
    ["Line subtotal", totals.subtotalCents],
    [`Overhead (${settings.overheadPct}%)`, totals.overheadCents],
    [`Profit (${settings.profitPct}%)`, totals.profitCents],
    [`Tax (${settings.taxPct}%)`, totals.taxCents],
    ["Replacement cost (RCV)", totals.rcvCents, true],
    ["Depreciation", -totals.depreciationCents],
    ["Actual cash value (ACV)", totals.acvCents, true],
    ["Deductible", -totals.deductibleCents],
  ];

  return (
    <div className="space-y-5">
      {locked && (
        <p className="flex items-center gap-2 rounded-md bg-ink-700 p-3 text-sm text-mist-strong">
          <Lock size={16} aria-hidden /> This version is locked as history. Create a supplement version to change the scope.
        </p>
      )}

      <div className="panel p-4">
        <div className="hidden gap-3 px-1 pb-2 text-xs text-mist md:grid md:grid-cols-[2.4fr_.8fr_.7fr_1fr_.7fr_.5fr_1fr_2rem]">
          <span>Description</span><span>Quantity</span><span>Unit</span><span>Unit price</span><span>Deprec. %</span><span>Tax</span><span className="text-right">Line total</span><span />
        </div>
        <ul className="divide-y divide-ink-600">
          {items.map((it, idx) => (
            <li key={it.key} className="grid gap-3 py-3 md:grid-cols-[2.4fr_.8fr_.7fr_1fr_.7fr_.5fr_1fr_2rem] md:items-center">
              <div>
                <label className="label md:sr-only" htmlFor={`d-${it.key}`}>Description</label>
                <input id={`d-${it.key}`} className="field" value={it.description} disabled={!editable} onChange={(e) => setItem(idx, { description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3 md:contents">
                <div>
                  <label className="label md:sr-only">Quantity</label>
                  <NumInput value={it.quantity} disabled={!editable} onCommit={(n) => setItem(idx, { quantity: n })} />
                </div>
                <div>
                  <label className="label md:sr-only" htmlFor={`u-${it.key}`}>Unit</label>
                  <select id={`u-${it.key}`} className="field" value={it.unit} disabled={!editable} onChange={(e) => setItem(idx, { unit: e.target.value as LineItemInput["unit"] })}>
                    {UNITS.map((u) => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 md:contents">
                <div>
                  <label className="label md:sr-only">Unit price (USD)</label>
                  <NumInput value={it.unitPriceCents} disabled={!editable} format={(c) => centsToDollars(c)} parse={(s) => dollarsToCents(parseFloat(s))} onCommit={(c) => setItem(idx, { unitPriceCents: c })} />
                </div>
                <div>
                  <label className="label md:sr-only">Depreciation %</label>
                  <NumInput value={it.depreciationPct} disabled={!editable} onCommit={(n) => setItem(idx, { depreciationPct: Math.min(n, 100) })} />
                </div>
              </div>
              <label className="flex min-h-[44px] items-center gap-2 text-sm md:justify-center">
                <input type="checkbox" className="h-5 w-5 accent-ember" checked={it.taxable} disabled={!editable} onChange={(e) => setItem(idx, { taxable: e.target.checked })} />
                <span className="md:sr-only">Taxable</span>
              </label>
              <p className="font-semibold md:text-right">{usd(totals.lineTotals[it.key] ?? 0)}</p>
              {editable ? (
                <button className="btn btn-ghost h-10 min-h-0 px-2" onClick={() => setItems((a) => a.filter((_, i) => i !== idx))} aria-label={`Remove ${it.description || "line"}`}><Trash2 size={16} /></button>
              ) : <span />}
            </li>
          ))}
        </ul>
        {editable && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button className="btn btn-ghost" onClick={addLine}><Plus size={16} aria-hidden /> Add blank line</button>
            <label className="sr-only" htmlFor="from-list">Add an item from your price list</label>
            <select id="from-list" className="field w-auto max-w-full" value="" onChange={(e) => {
              const p = priceItems.find((x) => x.key === e.target.value);
              if (p) setItems((arr) => [...arr, { key: p.key, description: p.description, category: p.category, unit: p.unit, quantity: 1, unitPriceCents: p.unitPriceCents, taxable: p.taxable, depreciationPct: 0 }]);
            }}>
              <option value="">Add from price list...</option>
              {priceItems.filter((p) => !items.some((i) => i.key === p.key)).map((p) => <option key={p.key} value={p.key}>{p.description} ({p.unit})</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="panel grid grid-cols-2 gap-4 p-4">
          {([["overheadPct", "Overhead %"], ["profitPct", "Profit %"], ["taxPct", "Tax %"]] as const).map(([k, label]) => (
            <div key={k}>
              <label className="label">{label}</label>
              <NumInput value={settings[k]} disabled={!editable} onCommit={(n) => setSettings((s) => ({ ...s, [k]: n }))} />
            </div>
          ))}
          <div>
            <label className="label">Deductible (USD)</label>
            <NumInput value={settings.deductibleCents} disabled={!editable} format={(c) => centsToDollars(c)} parse={(s) => dollarsToCents(parseFloat(s))} onCommit={(c) => setSettings((s) => ({ ...s, deductibleCents: c }))} />
          </div>
        </div>

        <dl className="panel space-y-2 p-4 text-sm">
          {summary.map(([k, v, strong]) => (
            <div key={k} className={clsx("flex justify-between", strong && "border-t border-ink-600 pt-2 font-semibold")}>
              <dt className="text-mist-strong">{k}</dt><dd>{usd(v)}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between border-t border-ember/50 pt-3">
            <dt className="font-display text-lg font-bold uppercase">Net claim</dt>
            <dd className="font-display text-3xl font-bold text-ember">{usd(totals.netClaimCents)}</dd>
          </div>
        </dl>
      </div>

      {editable && (
        <div className="flex items-center gap-3">
          <button className="btn btn-primary" disabled={!dirty || saving} onClick={() => onSave(items, settings)}>{saving ? "Saving" : "Save estimate"}</button>
          {dirty && <span className="text-sm text-warn">Unsaved changes</span>}
        </div>
      )}
    </div>
  );
}

function VersionDiff({ from, to }: { from: EstimateVersionDTO; to: EstimateVersionDTO }) {
  const d = diffVersions(from.lineItems, to.lineItems);
  const same = !d.added.length && !d.removed.length && !d.changed.length;
  return (
    <section className="panel p-4" aria-label={`Changes from version ${from.versionNo} to ${to.versionNo}`}>
      <h3 className="text-lg font-bold">Changes since version {from.versionNo}</h3>
      {same ? <p className="mt-2 text-sm text-mist">No line items changed.</p> : (
        <ul className="mt-2 space-y-1 text-sm">
          {d.added.map((i) => <li key={i.key} className="text-ok">Added: {i.description}</li>)}
          {d.removed.map((i) => <li key={i.key} className="text-bad">Removed: {i.description}</li>)}
          {d.changed.map((c) => <li key={c.key}>{c.description}: {c.from.quantity} {c.from.unit} at {usd(c.from.unitPriceCents)} to {c.to.quantity} {c.to.unit} at {usd(c.to.unitPriceCents)} ({c.deltaCents >= 0 ? "+" : ""}{usd(c.deltaCents)})</li>)}
        </ul>
      )}
      <p className="mt-3 text-sm font-semibold">Line subtotal change: {d.deltaSubtotalCents >= 0 ? "+" : ""}{usd(d.deltaSubtotalCents)}</p>
    </section>
  );
}

export function EstimateTab({ jobId }: { jobId: string }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);
  const [measurementId, setMeasurementId] = useState("");

  const estimate = useQuery({ queryKey: ["jobs", jobId, "estimate"], queryFn: () => api<{ estimate: EstimateDTO | null }>(`/jobs/${jobId}/estimate`) });
  const priceList = useQuery({ queryKey: ["price-list"], queryFn: () => api<PriceListDTO>("/price-lists/active") });
  const measurements = useQuery({ queryKey: ["jobs", jobId, "measurements"], queryFn: () => api<{ items: MeasurementDTO[] }>(`/jobs/${jobId}/measurements`) });

  const done = (e: { estimate: EstimateDTO }) => {
    qc.setQueryData(["jobs", jobId, "estimate"], e);
    qc.invalidateQueries({ queryKey: ["jobs", jobId] });
    qc.invalidateQueries({ queryKey: ["jobs", "summary"] });
  };
  const generate = useMutation({ mutationFn: (id: string) => post<{ estimate: EstimateDTO }>(`/jobs/${jobId}/estimate/generate`, { measurementId: id }), onSuccess: done });
  const save = useMutation({
    mutationFn: (v: { no: number; items: LineItemInput[]; s: EstimateSettingsInput }) =>
      api<{ estimate: EstimateDTO }>(`/jobs/${jobId}/estimate/versions/${v.no}`, { method: "PUT", body: JSON.stringify({ lineItems: v.items, settings: v.s }) }),
    onSuccess: done,
  });
  const newVersion = useMutation({
    mutationFn: (kind: "supplement" | "approved") => post<{ estimate: EstimateDTO }>(`/jobs/${jobId}/estimate/versions`, { kind }),
    onSuccess: (e) => { setSelected(null); done(e); },
  });

  const delivered = measurements.data?.items.filter((m) => m.status === "delivered") ?? [];
  const est = estimate.data?.estimate;

  if (estimate.isLoading) return <p className="text-mist">Loading estimate</p>;

  if (!est) {
    return (
      <section className="panel space-y-4 p-6" aria-label="Create estimate">
        <h2 className="text-2xl font-bold">Build the estimate</h2>
        {delivered.length === 0 ? (
          <p className="text-mist">Order and receive an aerial report first. Quantities are taken from it.</p>
        ) : (
          <>
            <p className="max-w-xl text-mist-strong">Start from a standard re-roof template. Quantities come from the measurement report and you can edit every line afterwards.</p>
            <div className="max-w-sm">
              <label className="label" htmlFor="meas">Measurement report</label>
              <select id="meas" className="field" value={measurementId || delivered[0]!.id} onChange={(e) => setMeasurementId(e.target.value)}>
                {delivered.map((m) => <option key={m.id} value={m.id}>{m.totals?.areaSqFt.toLocaleString()} sq ft, {new Date(m.createdAt).toLocaleDateString()}</option>)}
              </select>
            </div>
            {can("estimate:write") && <button className="btn btn-primary" disabled={generate.isPending} onClick={() => generate.mutate(measurementId || delivered[0]!.id)}>{generate.isPending ? "Building estimate" : "Build estimate from report"}</button>}
          </>
        )}
        {generate.isError && <p role="alert" className="text-bad">{(generate.error as Error).message}</p>}
      </section>
    );
  }

  const versionNo = selected ?? est.currentVersion;
  const version = est.versions.find((v) => v.versionNo === versionNo)!;
  const previous = est.versions.find((v) => v.versionNo === versionNo - 1);

  return (
    <section aria-label="Estimate" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Estimate</h2>
        {can("estimate:write") && (
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-ghost" disabled={newVersion.isPending} onClick={() => newVersion.mutate("approved")}>Record carrier-approved version</button>
            <button className="btn btn-ghost" disabled={newVersion.isPending} onClick={() => newVersion.mutate("supplement")}>New supplement version</button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Estimate versions">
        {est.versions.map((v) => (
          <button key={v.versionNo} role="tab" aria-selected={v.versionNo === versionNo} onClick={() => setSelected(v.versionNo)}
            className={clsx("min-h-[44px] rounded-md border px-3 text-sm", v.versionNo === versionNo ? "border-ember bg-ember/15 text-ember-300" : "border-ink-500 text-mist-strong hover:bg-ink-700")}>
            v{v.versionNo} {KIND_LABEL[v.kind]} {v.lockedAt && <Lock size={12} className="ml-1 inline" aria-label="locked" />}
          </button>
        ))}
      </div>
      {version.note && <p className="text-sm text-mist">{version.note}</p>}
      {(save.isError || newVersion.isError) && <p role="alert" className="text-bad">{((save.error || newVersion.error) as Error).message}</p>}

      <VersionEditor key={`${version.versionNo}-${version.createdAt}-${version.lockedAt ?? ""}-${JSON.stringify(version.settings)}`} version={version} canEdit={can("estimate:write")} saving={save.isPending} priceItems={priceList.data?.items ?? []}
        onSave={(items, s) => save.mutate({ no: version.versionNo, items, s })} />

      {previous && <VersionDiff from={previous} to={version} />}
    </section>
  );
}
