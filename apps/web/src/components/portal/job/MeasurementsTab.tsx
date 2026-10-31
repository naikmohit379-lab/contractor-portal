"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Ruler, X } from "lucide-react";
import { useState } from "react";
import { feetToMeters, squareFeetToSquareMeters, type JobDTO, type MeasurementDTO } from "@roofdesk/shared";
import { api, patch, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/format";

type RoofVQuota = {
  period?: string;
  included: number;
  includedUsed: number;
  includedRemaining: number;
  creditsBalance: number;
  creditsPerMeasurement: number;
  measurementsAvailable: number;
  resetsAt?: string;
};

function MeasurementCard({ m, measurementSystem = "metric", locale = "en-IN", onRefresh, refreshing = false }: { m: MeasurementDTO; measurementSystem?: "metric" | "imperial"; locale?: string; onRefresh?: (id: string) => void; refreshing?: boolean }) {
  const pending = m.status === "ordered" || m.status === "processing";
  const number = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 2 });
  const area = (sqFt: number) => measurementSystem === "metric" ? `${number(squareFeetToSquareMeters(sqFt))} m²` : `${number(sqFt)} sq ft`;
  const length = (ft: number) => measurementSystem === "metric" ? `${number(feetToMeters(ft))} m` : `${number(ft)} ft`;
  return (
    <article className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <div><h3 className="text-xl font-bold">Measurement report</h3><p className="text-xs text-mist">{m.provider === "mock" ? "Sample data" : m.provider === "manual" ? "Entered manually" : m.provider}</p></div>
        <span className={`rounded px-2 py-1 text-xs font-semibold capitalize ${m.status === "delivered" ? "bg-ok/15 text-ok" : m.status === "failed" ? "bg-bad/15 text-bad" : "bg-warn/15 text-warn"}`}>{m.status}</span>
      </div>
      {m.provider === "mock" && <p className="mt-3 rounded-md bg-warn/10 p-3 text-sm text-warn">This is generated sample data, not a measured roof. Do not use it to quote or order materials.</p>}
      {m.provider === "roofv" && m.preliminary && <p className="mt-3 rounded-md bg-warn/10 p-3 text-sm text-warn">This RoofV result is preliminary ({m.reviewStatus ?? "not reviewed"}). Verify it on site and do not rely on it as a technician-reviewed report.</p>}
      {pending && <p className="mt-3 text-sm text-mist">Waiting for the provider. This page updates on its own.</p>}
      {m.status === "failed" && <p className="mt-3 text-sm text-bad">{m.error}</p>}
      {m.provider === "roofv" && (m.status === "failed" || m.status === "delivered") && onRefresh && <div className="mt-3 space-y-2">
        <p className="text-sm text-mist">Refresh this existing RoofV report with a free read request. It does not order another measurement.</p>
        <button type="button" className="btn" onClick={() => onRefresh(m.id)} disabled={refreshing}>{refreshing ? "Refreshing existing report…" : "Refresh existing RoofV report"}</button>
      </div>}
      {m.status === "delivered" && m.totals && <>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[["Total area", area(m.totals.areaSqFt)], ...(measurementSystem === "imperial" ? [["Squares", String(m.totals.squares)]] : []), ["Pitch", m.facets[0]?.pitch ?? "-"], ["Waste factor", `${m.totals.wastePct}%`]].map(([k, v]) => <div key={k}><dt className="text-sm text-mist">{k}</dt><dd className="font-display text-2xl font-bold">{v}</dd></div>)}
        </dl>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[360px] text-left text-sm">
            <thead className="text-mist"><tr><th className="pb-2 font-medium">Facet</th><th className="pb-2 font-medium">Area ({measurementSystem === "metric" ? "m²" : "sq ft"})</th><th className="pb-2 font-medium">Pitch</th></tr></thead>
            <tbody>{m.facets.map((f) => <tr key={f.id} className="border-t border-ink-600"><td className="py-2">{f.id}</td><td>{measurementSystem === "metric" ? number(squareFeetToSquareMeters(f.areaSqFt)) : number(f.areaSqFt)}</td><td>{f.pitch}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-mist">Ridge {m.linear.ridge > 0 ? length(m.linear.ridge) : "not provided"} | Hip {m.linear.hip > 0 ? length(m.linear.hip) : "not provided"} | Valley {m.linear.valley > 0 ? length(m.linear.valley) : "not provided"} | Eave {m.linear.eave > 0 ? length(m.linear.eave) : "not provided"} | Rake {m.linear.rake > 0 ? length(m.linear.rake) : "not provided"}{m.imageryDate && ` | Imagery from ${fmtDate(m.imageryDate)}`}</p>
        {m.sourceNote && <p className="mt-2 text-sm text-mist">Source note: {m.sourceNote}</p>}
      </>}
    </article>
  );
}

export function MeasurementsTab({ jobId }: { jobId: string }) {
  const { can, user } = useAuth();
  const measurementSystem = user?.company.settings?.measurementSystem ?? "metric";
  const locale = user?.company.settings?.locale ?? "en-IN";
  const [manualOpen, setManualOpen] = useState(false);
  const [facets, setFacets] = useState([{ id: "A", area: "", pitch: "" }]);
  const [linear, setLinear] = useState({ ridge: "", hip: "", valley: "", eave: "", rake: "" });
  const [wastePct, setWastePct] = useState("12");
  const [imageryDate, setImageryDate] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [provider, setProvider] = useState<"mock" | "roofv">("mock");
  const [pitch, setPitch] = useState("6");
  const [roofvConsent, setRoofvConsent] = useState(false);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const qc = useQueryClient();
  const job = useQuery({ queryKey: ["jobs", jobId], queryFn: () => api<JobDTO>(`/jobs/${jobId}`) });
  const saveCoordinates = useMutation({
    mutationFn: () => patch<JobDTO>(`/jobs/${jobId}`, { property: { coordinates: { lat: Number(latitude), lng: Number(longitude) } } }),
    onSuccess: (updated) => { qc.setQueryData(["jobs", jobId], updated); setLatitude(""); setLongitude(""); },
  });
  const measurements = useQuery({
    queryKey: ["jobs", jobId, "measurements"],
    queryFn: () => api<{ items: MeasurementDTO[] }>(`/jobs/${jobId}/measurements`),
    refetchInterval: (q) => (q.state.data?.items.some((m) => m.status === "ordered" || m.status === "processing") ? 5 * 60_000 : false),
  });
  const roofvQuota = useQuery({
    queryKey: ["providers", "roofv", "quota"],
    queryFn: () => api<{ quota: RoofVQuota }>("/providers/roofv/quota"),
    enabled: false,
    retry: false,
  });
  const order = useMutation({
    mutationFn: () => post<MeasurementDTO>(`/jobs/${jobId}/measurements`, {
      provider,
      ...(provider === "roofv" ? { pitch: Number(pitch), roofvConsent } : {}),
    }, { "Idempotency-Key": crypto.randomUUID() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs", jobId] }),
  });
  const refreshExistingRoofV = useMutation({
    mutationFn: (reportId: string) => post<MeasurementDTO>(`/jobs/${jobId}/measurements/${reportId}/refresh`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs", jobId, "measurements"] }),
  });
  const manual = useMutation({
    mutationFn: () => post<MeasurementDTO>(`/jobs/${jobId}/measurements/manual`, {
      measurementSystem,
      facets: facets.map((facet) => ({ ...facet, area: Number(facet.area) })),
      linear: Object.fromEntries(Object.entries(linear).map(([key, value]) => [key, Number(value || 0)])),
      wastePct: Number(wastePct), imageryDate: imageryDate || undefined, sourceNote: sourceNote || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs", jobId] });
      setManualOpen(false);
      setFacets([{ id: "A", area: "", pitch: "" }]);
      setLinear({ ridge: "", hip: "", valley: "", eave: "", rake: "" });
      setWastePct("12"); setImageryDate(""); setSourceNote("");
    },
  });
  const busy = measurements.data?.items.some((m) => m.status === "ordered" || m.status === "processing");
  return <section aria-label="Measurements" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-2xl font-bold">Measurements</h2>
      {can("measurement:order") && <div className="flex flex-wrap gap-2"><button className="btn" type="button" onClick={() => setManualOpen((open) => !open)}>{manualOpen ? "Close manual entry" : "Enter report manually"}</button></div>}
    </div>
    {can("measurement:order") && <div className="panel space-y-3 p-4">
      <div><h3 className="font-bold">Order a roof measurement</h3><p className="text-sm text-mist">Sample mode creates fake data for testing. RoofV sends this job’s address and saved map coordinates to RoofV; a new request may use the workspace’s included quota or paid credits.</p></div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div><label className="label" htmlFor="measurement-provider">Provider</label><select id="measurement-provider" className="field" value={provider} onChange={(event) => setProvider(event.target.value as "mock" | "roofv")}><option value="mock">Sample report (no external request)</option><option value="roofv">RoofV (India)</option></select></div>
        {provider === "roofv" && <div><label className="label" htmlFor="roofv-pitch">Roof pitch (rise per 12; 0 for flat)</label><input id="roofv-pitch" className="field" type="number" min="0" max="24" step="0.5" value={pitch} onChange={(event) => setPitch(event.target.value)} /></div>}
        <button className="btn btn-primary" onClick={() => order.mutate()} disabled={order.isPending || busy || (provider === "roofv" && (!roofvConsent || !job.data?.property.coordinates || job.data?.property.country !== "IN"))}><Ruler size={18} aria-hidden /> {busy ? "Report in progress" : provider === "roofv" ? "Request RoofV measurement" : "Generate sample report"}</button>
      </div>
      {provider === "roofv" && <div className="space-y-2 text-sm">
        <div className="rounded border border-ink-600 p-3">
          <button className="btn" type="button" onClick={() => void roofvQuota.refetch()} disabled={roofvQuota.isFetching}>
            {roofvQuota.isFetching ? "Checking free quota…" : "Check RoofV free quota"}
          </button>
          <p className="mt-2 text-mist">This free check sends only the server-held API key to RoofV. It does not send this property’s address or order a measurement.</p>
          {roofvQuota.isError && <p role="alert" className="mt-2 text-bad">{(roofvQuota.error as Error).message}</p>}
          {roofvQuota.data && <div className="mt-2 space-y-1" aria-live="polite">
            <p>Included measurements remaining: <strong>{roofvQuota.data.quota.includedRemaining}</strong> of {roofvQuota.data.quota.included}{roofvQuota.data.quota.period ? ` (${roofvQuota.data.quota.period})` : ""}</p>
            <p>Prepaid credits: <strong>{roofvQuota.data.quota.creditsBalance}</strong> ({roofvQuota.data.quota.creditsPerMeasurement} credits per measurement)</p>
            <p>Total available measurements: <strong>{roofvQuota.data.quota.measurementsAvailable}</strong></p>
          </div>}
        </div>
        {job.data?.property.country !== "IN" && <p className="text-warn">RoofV ordering is currently limited to Indian properties.</p>}
        {!job.data?.property.coordinates && <div className="space-y-2 rounded border border-warn/40 p-3">
          <p className="text-warn">This job has no saved latitude and longitude. Enter the verified map-pin coordinates before ordering.</p>
          {can("job:write") && <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <div><label className="label" htmlFor="roofv-latitude">Latitude</label><input className="field" id="roofv-latitude" type="number" min="-90" max="90" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} /></div>
            <div><label className="label" htmlFor="roofv-longitude">Longitude</label><input className="field" id="roofv-longitude" type="number" min="-180" max="180" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} /></div>
            <button className="btn self-end" type="button" disabled={saveCoordinates.isPending || !latitude || !longitude} onClick={() => saveCoordinates.mutate()}>{saveCoordinates.isPending ? "Saving…" : "Save coordinates"}</button>
          </div>}
          {saveCoordinates.isError && <p role="alert" className="text-bad">{(saveCoordinates.error as Error).message}</p>}
        </div>}
        <label className="flex items-start gap-2"><input className="mt-1" type="checkbox" checked={roofvConsent} onChange={(event) => setRoofvConsent(event.target.checked)} /><span>I understand the property address and coordinates will be sent to RoofV, and the request may consume included measurements or paid credits.</span></label>
        <p className="text-mist">RoofV reports may be preliminary or pending review. Verify measurements on site before purchasing materials. Do not retry if a request times out; check this report first to avoid duplicate usage.</p>
      </div>}
      {provider === "mock" && <p className="text-sm text-mist">Generated sample data is only for testing and must not be used to quote or order materials.</p>}
    </div>}
    {order.isError && <p role="alert" className="text-bad">{(order.error as Error).message}</p>}
    {manualOpen && <form className="panel space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); manual.mutate(); }}>
      <div><h3 className="text-xl font-bold">Enter a roof report</h3><p className="text-sm text-mist">Enter values from a report or verified site measurement. Values are normalized for estimates and shown in your company’s preferred units.</p></div>
      <fieldset className="space-y-3"><legend className="font-semibold">Roof facets</legend>{facets.map((facet, index) => <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1.5fr_1fr_auto]">
        <div><label className="label" htmlFor={`facet-id-${index}`}>Facet name</label><input id={`facet-id-${index}`} className="field" required maxLength={20} value={facet.id} onChange={(event) => setFacets((items) => items.map((item, i) => i === index ? { ...item, id: event.target.value } : item))} /></div>
        <div><label className="label" htmlFor={`facet-area-${index}`}>Area ({measurementSystem === "metric" ? "m²" : "sq ft"})</label><input id={`facet-area-${index}`} className="field" type="number" min="0.01" step="any" required value={facet.area} onChange={(event) => setFacets((items) => items.map((item, i) => i === index ? { ...item, area: event.target.value } : item))} /></div>
        <div><label className="label" htmlFor={`facet-pitch-${index}`}>Pitch</label><input id={`facet-pitch-${index}`} className="field" required placeholder="e.g. 4:12 or flat" value={facet.pitch} onChange={(event) => setFacets((items) => items.map((item, i) => i === index ? { ...item, pitch: event.target.value } : item))} /></div>
        {facets.length > 1 && <button className="btn self-end" type="button" aria-label={`Remove facet ${facet.id}`} onClick={() => setFacets((items) => items.filter((_, i) => i !== index))}><X size={16} /></button>}
      </div>)}<button className="btn" type="button" onClick={() => setFacets((items) => [...items, { id: String.fromCharCode(65 + items.length), area: "", pitch: "" }])}><Plus size={16} /> Add facet</button></fieldset>
      <fieldset className="space-y-3"><legend className="font-semibold">Linear measurements ({measurementSystem === "metric" ? "m" : "ft"})</legend><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{(Object.keys(linear) as (keyof typeof linear)[]).map((key) => <div key={key}><label className="label capitalize" htmlFor={`linear-${key}`}>{key}</label><input id={`linear-${key}`} className="field" type="number" min="0" step="any" value={linear[key]} onChange={(event) => setLinear((values) => ({ ...values, [key]: event.target.value }))} /></div>)}</div></fieldset>
      <div className="grid gap-3 sm:grid-cols-2"><div><label className="label" htmlFor="manual-waste">Waste allowance (%)</label><input id="manual-waste" className="field" type="number" min="0" max="100" step="any" required value={wastePct} onChange={(event) => setWastePct(event.target.value)} /></div><div><label className="label" htmlFor="manual-imagery-date">Report or imagery date (optional)</label><input id="manual-imagery-date" className="field" type="date" value={imageryDate} onChange={(event) => setImageryDate(event.target.value)} /></div></div>
      <div><label className="label" htmlFor="manual-source-note">Source note (optional)</label><input id="manual-source-note" className="field" maxLength={300} placeholder="Provider report reference or site visit" value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} /></div>
      {manual.isError && <p role="alert" className="text-bad">{(manual.error as Error).message}</p>}
      <button className="btn btn-primary" type="submit" disabled={manual.isPending}>{manual.isPending ? "Saving report…" : "Save measurement report"}</button>
    </form>}
    {measurements.data?.items.length === 0 && <p className="panel p-6 text-mist">No reports yet. Enter a report manually, order a RoofV measurement, or generate sample data for testing.</p>}
    {measurements.data?.items.map((m) => <MeasurementCard key={m.id} m={m} measurementSystem={measurementSystem} locale={locale} onRefresh={m.provider === "roofv" && ["failed", "delivered"].includes(m.status) ? (id) => refreshExistingRoofV.mutate(id) : undefined} refreshing={refreshExistingRoofV.isPending} />)}
  </section>;
}
