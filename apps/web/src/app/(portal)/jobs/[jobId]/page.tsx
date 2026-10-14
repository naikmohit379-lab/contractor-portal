"use client";

import clsx from "clsx";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { JOB_STAGES, STAGE_LABELS, type JobDTO, type JobStage } from "@roofdesk/shared";
import { ClaimTab } from "@/components/portal/job/ClaimTab";
import { EstimateTab } from "@/components/portal/job/EstimateTab";
import { MeasurementsTab } from "@/components/portal/job/MeasurementsTab";
import { OrdersTab } from "@/components/portal/job/OrdersTab";
import { PaymentsTab } from "@/components/portal/job/PaymentsTab";
import { PhotosTab } from "@/components/portal/job/PhotosTab";
import { WaiversTab } from "@/components/portal/job/WaiversTab";
import { StageBadge } from "@/components/portal/StageBadge";
import { api, patch } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const TABS = [
  { id: "measurements", label: "Measurements" },
  { id: "photos", label: "Photos" },
  { id: "estimate", label: "Estimate" },
  { id: "claim", label: "Claim" },
  { id: "orders", label: "Orders" },
  { id: "waivers", label: "Waivers" },
  { id: "payments", label: "Payments" },
] as const;

function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { can } = useAuth();
  const qc = useQueryClient();
  const tab = TABS.find((t) => t.id === params.get("tab"))?.id ?? "measurements";

  const job = useQuery({ queryKey: ["jobs", jobId], queryFn: () => api<JobDTO>(`/jobs/${jobId}`) });
  const setStage = useMutation({
    mutationFn: (stage: JobStage) => patch<JobDTO>(`/jobs/${jobId}/stage`, { stage }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["jobs", jobId] }); qc.invalidateQueries({ queryKey: ["jobs", "summary"] }); },
  });

  if (job.isLoading) return <p className="text-mist">Loading job</p>;
  if (job.isError || !job.data) return <p className="text-bad">This job could not be found.</p>;
  const j = job.data;

  return (
    <div className="space-y-6">
      <Link href="/jobs" className="inline-flex min-h-[44px] items-center gap-1 text-sm text-mist-strong hover:text-white"><ArrowLeft size={16} aria-hidden /> All jobs</Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-mist">{j.jobNumber} | <span className="capitalize">{j.type}</span></p>
          <h1 className="text-4xl font-bold">{j.customer.name}</h1>
          <p className="text-mist-strong">{j.property.line1}, {j.property.city}, {j.property.state} {j.property.zip}</p>
        </div>
        <div className="flex items-center gap-3">
          <StageBadge stage={j.stage} />
          {can("job:write") && (
            <select className="field w-52" aria-label="Move job to stage" value={j.stage} disabled={setStage.isPending} onChange={(e) => setStage.mutate(e.target.value as JobStage)}>
              {JOB_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
            </select>
          )}
        </div>
      </header>

      <nav className="-mx-5 flex overflow-x-auto border-b border-ink-600 px-5" aria-label="Job sections">
        {TABS.map((t) => (
          <button key={t.id} aria-current={tab === t.id ? "page" : undefined} onClick={() => router.replace(`/jobs/${jobId}?tab=${t.id}`, { scroll: false })}
            className={clsx("min-h-[44px] whitespace-nowrap border-b-2 px-4 text-sm font-semibold", tab === t.id ? "border-ember text-ember" : "border-transparent text-mist-strong hover:text-white")}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "measurements" && <MeasurementsTab jobId={jobId} />}
      {tab === "photos" && <PhotosTab jobId={jobId} />}
      {tab === "estimate" && <EstimateTab jobId={jobId} />}
      {tab === "claim" && <ClaimTab jobId={jobId} />}
      {tab === "orders" && <OrdersTab jobId={jobId} />}
      {tab === "waivers" && <WaiversTab jobId={jobId} />}
      {tab === "payments" && <PaymentsTab jobId={jobId} />}
    </div>
  );
}

export default function JobDetailPage() {
  return (
    <Suspense fallback={<p className="text-mist">Loading job</p>}>
      <JobDetail />
    </Suspense>
  );
}
