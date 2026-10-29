"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ruler } from "lucide-react";
import { feetToMeters, squareFeetToSquareMeters, type MeasurementDTO } from "@roofdesk/shared";
import { api, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/format";

function MeasurementCard({ m, measurementSystem = "imperial", locale = "en-US" }: { m: MeasurementDTO; measurementSystem?: "metric" | "imperial"; locale?: string }) {
  const pending = m.status === "ordered" || m.status === "processing";
  const number = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 2 });
  const area = (sqFt: number) => measurementSystem === "metric" ? `${number(squareFeetToSquareMeters(sqFt))} m²` : `${number(sqFt)} sq ft`;
  const length = (ft: number) => measurementSystem === "metric" ? `${number(feetToMeters(ft))} m` : `${number(ft)} ft`;
  return (
    <article className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xl font-bold">Aerial report</h3>
        <span className={`rounded px-2 py-1 text-xs font-semibold capitalize ${m.status === "delivered" ? "bg-ok/15 text-ok" : m.status === "failed" ? "bg-bad/15 text-bad" : "bg-warn/15 text-warn"}`}>{m.status}</span>
      </div>
      {pending && <p className="mt-3 text-sm text-mist">Waiting for the provider. This page updates on its own.</p>}
      {m.status === "failed" && <p className="mt-3 text-sm text-bad">{m.error}</p>}
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
        <p className="mt-4 text-sm text-mist">Ridge {length(m.linear.ridge)} | Hip {length(m.linear.hip)} | Valley {length(m.linear.valley)} | Eave {length(m.linear.eave)} | Rake {length(m.linear.rake)}{m.imageryDate && ` | Imagery from ${fmtDate(m.imageryDate)}`}</p>
      </>}
    </article>
  );
}

export function MeasurementsTab({ jobId }: { jobId: string }) {
  const { can, user } = useAuth();
  const measurementSystem = user?.company.settings?.measurementSystem ?? "imperial";
  const locale = user?.company.settings?.locale ?? "en-US";
  const qc = useQueryClient();
  const measurements = useQuery({
    queryKey: ["jobs", jobId, "measurements"],
    queryFn: () => api<{ items: MeasurementDTO[] }>(`/jobs/${jobId}/measurements`),
    refetchInterval: (q) => (q.state.data?.items.some((m) => m.status === "ordered" || m.status === "processing") ? 15000 : false),
  });
  const order = useMutation({
    mutationFn: () => post<MeasurementDTO>(`/jobs/${jobId}/measurements`, { provider: "mock" }, { "Idempotency-Key": crypto.randomUUID() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs", jobId] }),
  });
  const busy = measurements.data?.items.some((m) => m.status === "ordered" || m.status === "processing");
  return <section aria-label="Measurements" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-2xl font-bold">Measurements</h2>
      {can("measurement:order") && <button className="btn btn-primary" onClick={() => order.mutate()} disabled={order.isPending || busy}><Ruler size={18} aria-hidden /> {busy ? "Report in progress" : "Order aerial report"}</button>}
    </div>
    {order.isError && <p role="alert" className="text-bad">{(order.error as Error).message}</p>}
    {measurements.data?.items.length === 0 && <p className="panel p-6 text-mist">No reports yet. Order an aerial report to get roof area, pitch and linear measurements.</p>}
    {measurements.data?.items.map((m) => <MeasurementCard key={m.id} m={m} measurementSystem={measurementSystem} locale={locale} />)}
  </section>;
}
