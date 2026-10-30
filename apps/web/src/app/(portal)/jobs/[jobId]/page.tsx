"use client";

import clsx from "clsx";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { JOB_STAGES, type JobDTO, type JobStage } from "@roofdesk/shared";
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
import { useJobStageLabels } from "@/lib/jobStages";

const NO_ASSIGNEES: string[] = [];

function OperationsAssignees({ jobId, assignedIds = NO_ASSIGNEES }: { jobId: string; assignedIds?: string[] }) {
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ["operations", "assignees"], queryFn: () => api<{ items: { id: string; name: string; email: string }[] }>("/jobs/assignees") });
  const [selected, setSelected] = useState<string[]>(assignedIds);
  useEffect(() => setSelected(assignedIds), [assignedIds]);
  const save = useMutation({
    mutationFn: () => patch(`/jobs/${jobId}/assignees`, { userIds: selected }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["jobs", jobId] }); qc.invalidateQueries({ queryKey: ["operations", "overview"] }); },
  });
  return <section className="panel space-y-3 p-4" aria-labelledby="operations-assignees">
    <div><h2 id="operations-assignees" className="font-bold">Operations assignment</h2><p className="text-sm text-mist">Only assigned interns can open this job in their operations workspace.</p></div>
    {users.isLoading ? <p className="text-sm text-mist">Loading team members…</p> : users.isError ? <p role="alert" className="text-sm text-bad">Operations team could not be loaded.</p> : users.data?.items.length ? <>
      <div className="flex flex-wrap gap-3">{users.data.items.map((user) => <label key={user.id} className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-ember" checked={selected.includes(user.id)} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, user.id] : ids.filter((id) => id !== user.id))} />{user.name}</label>)}</div>
      <button className="btn btn-ghost h-10 min-h-0 px-3" disabled={save.isPending || selected.join(",") === assignedIds.join(",")} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save assignments"}</button>
    </> : <p className="text-sm text-mist">No active Operations Intern accounts yet. Ask an owner or admin to invite the intern from the Operations Interns page.</p>}
    {save.isError && <p role="alert" className="text-sm text-bad">{(save.error as Error).message}</p>}
  </section>;
}

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
  const stageLabels = useJobStageLabels();
  const qc = useQueryClient();

  const job = useQuery({ queryKey: ["jobs", jobId], queryFn: () => api<JobDTO>(`/jobs/${jobId}`) });
  const setStage = useMutation({
    mutationFn: (stage: JobStage) => patch<JobDTO>(`/jobs/${jobId}/stage`, { stage }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["jobs", jobId] }); qc.invalidateQueries({ queryKey: ["jobs", "summary"] }); },
  });

  if (job.isLoading) return <p className="text-mist">Loading job</p>;
  if (job.isError || !job.data) return <p className="text-bad">This job could not be found.</p>;
  const j = job.data;
  const legacyUsJob = j.property.country !== "IN";
  const visibleTabs = legacyUsJob ? TABS : TABS.filter((item) => item.id !== "claim" && item.id !== "waivers");
  const tab = visibleTabs.find((item) => item.id === params.get("tab"))?.id ?? "measurements";

  return (
    <div className="space-y-6">
      <Link href="/jobs" className="inline-flex min-h-[44px] items-center gap-1 text-sm text-mist-strong hover:text-white"><ArrowLeft size={16} aria-hidden /> All jobs</Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-mist">{j.jobNumber} | <span className="capitalize">{j.type}</span></p>
          <h1 className="text-4xl font-bold">{j.customer.name}</h1>
          <p className="text-mist-strong">{[j.property.line1, j.property.line2, j.property.locality, j.property.city, j.property.district, j.property.state, j.property.country === "IN" ? j.property.pinCode : j.property.zip].filter(Boolean).join(", ")}</p>
        </div>
        <div className="flex items-center gap-3">
          <StageBadge stage={j.stage} />
          {can("job:write") && (
            <select className="field w-52" aria-label="Move job to stage" value={j.stage} disabled={setStage.isPending} onChange={(e) => setStage.mutate(e.target.value as JobStage)}>
              {JOB_STAGES.map((s) => <option key={s} value={s}>{stageLabels[s]}</option>)}
            </select>
          )}
        </div>
      </header>

      {can("job:assign") && <OperationsAssignees jobId={jobId} assignedIds={j.assigneeIds} />}

      <nav className="-mx-5 flex overflow-x-auto border-b border-ink-600 px-5" aria-label="Job sections">
        {visibleTabs.map((t) => (
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
