"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ruler } from "lucide-react";
import type { MeasurementDTO } from "@roofdesk/shared";
import { api, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/format";

const fmt = (n?: number) => (n === undefined ? "-" : n.toLocaleString());

function MeasurementCard({ m }: { m: MeasurementDTO }) {
  const pending = m.status === "ordered" || m.status === "processing";
  return (
    <article className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xl font-bold">Aerial report</h3>
        <span className={`rounded px-2 py-1 text-xs font-semibold capitalize ${m.status === "delivered" ? "bg-ok/15 text-ok" : m.status === "failed" ? "bg-bad/15 text-bad" : "bg-warn/15 text-warn"}`}>
          {m.status}
        </span>
      </div>
      {pending && <p className="mt-3 text-sm text-mist">Waiting for the provider. This page updates on its own.</p>}
      {m.status === "failed" && <p className="mt-3 text-sm text-bad">{m.error}</p>}
      {m.status === "delivered" && m.totals && (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[["Total area", `${fmt(m.totals.areaSqFt)} sq ft`], ["Squares", String(m.totals.squares)], ["Pitch", m.facets[0]?.pitch ?? "-"], ["Waste factor", `${m.totals.wastePct}%`]].map(([k, v]) => (
              <div key={k}><dt className="text-sm text-mist">{k}</dt><dd className="font-display text-2xl font-bold">{v}</dd></div>
            ))}
          </dl>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[360px] text-left text-sm">
              <thead className="text-mist"><tr><th className="pb-2 font-medium">Facet</th><th className="pb-2 font-medium">Area (sq ft)</th><th className="pb-2 font-medium">Pitch</th></tr></thead>
              <tbody>{m.facets.map((f) => <tr key={f.id} className="border-t border-ink-600"><td className="py-2">{f.id}</td><td>{fmt(f.areaSqFt)}</td><td>{f.pitch}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-mist">
            Ridge {m.linear.ridge} ft | Hip {m.linear.hip} ft | Valley {m.linear.valley} ft | Eave {m.linear.eave} ft | Rake {m.linear.rake} ft
            {m.imageryDate && ` | Imagery from ${fmtDate(m.imageryDate)}`}
          </p>
        </>
      )}
    </article>
  );
}

export function MeasurementsTab({ jobId }: { jobId: string }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const measurements = useQuery({
    queryKey: ["jobs", jobId, "measurements"],
    queryFn: () => api<{ items: MeasurementDTO[] }>(`/jobs/${jobId}/measurements`),
    // The live stream refreshes this when the report lands. This slow poll is only a fallback if the stream is down.
    refetchInterval: (q) => (q.state.data?.items.some((m) => m.status === "ordered" || m.status === "processing") ? 15000 : false),
  });
  const order = useMutation({
    mutationFn: () => post<MeasurementDTO>(`/jobs/${jobId}/measurements`, { provider: "mock" }, { "Idempotency-Key": crypto.randomUUID() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs", jobId] }),
  });
  const busy = measurements.data?.items.some((m) => m.status === "ordered" || m.status === "processing");

  return (
    <section aria-label="Measurements" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Measurements</h2>
        {can("measurement:order") && (
          <button className="btn btn-primary" onClick={() => order.mutate()} disabled={order.isPending || busy}>
            <Ruler size={18} aria-hidden /> {busy ? "Report in progress" : "Order aerial report"}
          </button>
        )}
      </div>
      {order.isError && <p role="alert" className="text-bad">{(order.error as Error).message}</p>}
      {measurements.data?.items.length === 0 && <p className="panel p-6 text-mist">No reports yet. Order an aerial report to get roof area, pitch and linear feet.</p>}
      {measurements.data?.items.map((m) => <MeasurementCard key={m.id} m={m} />)}
    </section>
  );
}
