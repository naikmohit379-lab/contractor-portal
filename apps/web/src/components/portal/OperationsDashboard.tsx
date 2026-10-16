"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import type { JobStage } from "@roofdesk/shared";
import { api, patch, post } from "@/lib/api";
import { fmtCalendarDate, fmtDate } from "@/lib/format";

type JobSummary = { id: string; jobNumber: string; customerName: string; address: string; stage: JobStage; updatedAt: string };
type QueueEntry = { job?: JobSummary };
type Overview = {
  generatedAt: string;
  counts: { assignedJobs: number; missingDocuments: number; claimsNeedingFollowUp: number; unsignedWaivers: number; supplierOrdersNeedingAttention: number; openTasks: number };
  queues: {
    assignedJobs: JobSummary[];
    missingDocuments: QueueEntry[];
    claims: (QueueEntry & { claimNo: string; carrier: string; status: string; updatedAt: string })[];
    waivers: (QueueEntry & { partyName: string; status: string; type: string; requestedAt: string })[];
    orders: (QueueEntry & { poNumber: string; status: string; deliveryDate?: string; updatedAt: string })[];
    tasks: { id: string; job?: JobSummary; title: string; details?: string; status: "open" | "blocked"; dueAt?: string; updatedAt: string }[];
  };
};

const formatStatus = (value: string) => value.replaceAll("_", " ").replace(/^./, (s) => s.toUpperCase());
const jobHref = (job: JobSummary | undefined, tab?: string) => job ? `/jobs/${job.id}${tab ? `?tab=${tab}` : ""}` : "/jobs";

function Metric({ label, value, href, warning = false }: { label: string; value: number; href?: string; warning?: boolean }) {
  const body = <><span className="text-sm text-mist">{label}</span><strong className={`font-display text-3xl ${warning && value > 0 ? "text-warn" : ""}`}>{value}</strong></>;
  return href ? <Link href={href} className="panel flex min-h-28 flex-col justify-between p-4 transition hover:-translate-y-0.5 hover:border-ember">{body}</Link> : <div className="panel flex min-h-28 flex-col justify-between p-4">{body}</div>;
}

function Queue({ title, empty, children }: { title: string; empty: boolean; children: ReactNode }) {
  return <section className="panel overflow-hidden">
    <h2 className="border-b border-ink-600 px-4 py-3 text-lg font-bold">{title}</h2>
    {empty ? <p className="p-4 text-sm text-mist">Nothing needs attention here right now.</p> : <ul className="divide-y divide-ink-600">{children}</ul>}
  </section>;
}

function QueueLink({ job, tab, title, meta }: { job?: JobSummary; tab: string; title: string; meta: string }) {
  return <li><Link href={jobHref(job, tab)} className="flex min-h-[64px] flex-col justify-center gap-1 px-4 py-3 hover:bg-ink-700 sm:flex-row sm:items-center sm:justify-between">
    <span className="min-w-0"><strong className="block truncate">{title}</strong><span className="text-sm text-mist">{job?.jobNumber ?? "Job"} · {job?.customerName ?? "Assigned work"}</span></span>
    <span className="text-xs capitalize text-mist-strong">{meta}</span>
  </Link></li>;
}

export function OperationsDashboard({ managerView = false }: { managerView?: boolean }) {
  const qc = useQueryClient();
  const [jobId, setJobId] = useState("");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["operations", "overview"], queryFn: () => api<Overview>("/operations/overview"), refetchInterval: 60_000 });
  const createTask = useMutation({
    mutationFn: () => post("/operations/tasks", { jobId, title, details: details || undefined, dueAt: dueAt ? new Date(`${dueAt}T23:59:59.000Z`).toISOString() : undefined }),
    onSuccess: () => { setTitle(""); setDetails(""); setDueAt(""); setFormError(null); qc.invalidateQueries({ queryKey: ["operations", "overview"] }); },
    onError: (error) => setFormError((error as Error).message),
  });
  const updateTask = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "open" | "blocked" | "done" }) => patch(`/operations/tasks/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operations", "overview"] }),
  });

  if (q.isLoading) return <p className="text-mist">Loading your operations workspace…</p>;
  if (q.isError || !q.data) return <div role="alert" className="panel p-5 text-bad">The operations dashboard could not load. Refresh to try again.</div>;
  const { counts, queues } = q.data;
  const availableJobs = queues.assignedJobs;

  return <div className="space-y-6">
    <header className="space-y-1">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-ember">Operations workspace</p>
      <h2 className="text-3xl font-bold">{managerView ? "Operations follow-ups" : "Today’s work"}</h2>
      <p className="text-mist">{managerView ? "Review team queues and intern handoffs. Assign jobs from each job record." : "Review assigned jobs, flag blockers, and keep follow-ups moving. Sensitive approvals stay with your supervisor."}</p>
    </header>

    <section className="grid grid-cols-2 gap-3 lg:grid-cols-3" aria-label="Operations summary">
      <Metric label={managerView ? "Team jobs" : "Assigned jobs"} value={counts.assignedJobs} href="/jobs" />
      <Metric label="Missing files" value={counts.missingDocuments} warning href="#missing-files" />
      <Metric label="Claims to follow up" value={counts.claimsNeedingFollowUp} warning href="#claims" />
      <Metric label="Unsigned waivers" value={counts.unsignedWaivers} warning href="#waivers" />
      <Metric label="Orders to check" value={counts.supplierOrdersNeedingAttention} href="#orders" />
      <Metric label="Open follow-up tasks" value={counts.openTasks} warning href="#tasks" />
    </section>

    <section className="panel space-y-4 p-4" aria-labelledby="flag-title">
      <div><h2 id="flag-title" className="text-xl font-bold">{managerView ? "Create a follow-up task" : "Flag something for your supervisor"}</h2><p className="text-sm text-mist">{managerView ? "Create an internal task linked to a job for the team to follow up." : "Create an internal follow-up task linked to one of your assigned jobs."}</p></div>
      {availableJobs.length === 0 ? <p className="rounded-md bg-ink-800 p-3 text-sm text-mist">{managerView ? "No jobs are available yet." : "No jobs are assigned to you yet. Ask your manager to assign work from a job record."}</p> : <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (!jobId || title.trim().length < 3) { setFormError("Choose a job and enter a short task title."); return; } createTask.mutate(); }}>
        <div><label htmlFor="ops-job" className="label">Assigned job</label><select id="ops-job" className="field" value={jobId} onChange={(event) => setJobId(event.target.value)}><option value="">Choose a job</option>{availableJobs.map((job) => <option key={job.id} value={job.id}>{job.jobNumber} · {job.customerName}</option>)}</select></div>
        <div><label htmlFor="ops-title" className="label">What needs attention?</label><input id="ops-title" className="field" maxLength={140} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Missing inspection photos" /></div>
        <div><label htmlFor="ops-details" className="label">Details (optional)</label><textarea id="ops-details" className="field min-h-20" maxLength={1200} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Add context for your supervisor" /></div>
        <div className="flex flex-col justify-end gap-3 sm:flex-row sm:items-end"><div className="flex-1"><label htmlFor="ops-due" className="label">Follow-up date (optional)</label><input id="ops-due" type="date" className="field" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></div><button className="btn btn-primary" disabled={createTask.isPending}>{createTask.isPending ? "Saving…" : managerView ? "Create task" : "Flag for supervisor"}</button></div>
        {formError && <p role="alert" className="text-sm text-bad md:col-span-2">{formError}</p>}
      </form>}
    </section>

    <div className="grid gap-4 xl:grid-cols-2">
      <div id="missing-files"><Queue title="Jobs with no uploaded files" empty={!queues.missingDocuments.length}>{queues.missingDocuments.map(({ job }) => <QueueLink key={job?.id} job={job} tab="photos" title="Review photos and documents" meta="Files needed" />)}</Queue></div>
      <div id="claims"><Queue title="Claims needing follow-up" empty={!queues.claims.length}>{queues.claims.map((claim, index) => <QueueLink key={`${claim.job?.id}-${claim.claimNo}-${index}`} job={claim.job} tab="claim" title={`${claim.carrier} · ${claim.claimNo}`} meta={formatStatus(claim.status)} />)}</Queue></div>
      <div id="waivers"><Queue title="Unsigned waivers" empty={!queues.waivers.length}>{queues.waivers.map((waiver, index) => <QueueLink key={`${waiver.job?.id}-${waiver.partyName}-${index}`} job={waiver.job} tab="waivers" title={waiver.partyName} meta={`${formatStatus(waiver.status)} · ${formatStatus(waiver.type)}`} />)}</Queue></div>
      <div id="orders"><Queue title="Supplier orders to check" empty={!queues.orders.length}>{queues.orders.map((order, index) => <QueueLink key={`${order.job?.id}-${order.poNumber}-${index}`} job={order.job} tab="orders" title={`Purchase order ${order.poNumber}`} meta={`${formatStatus(order.status)}${order.deliveryDate ? ` · ${fmtDate(order.deliveryDate)}` : ""}`} />)}</Queue></div>
      <div id="tasks" className="xl:col-span-2"><Queue title="Open follow-up tasks" empty={!queues.tasks.length}>{queues.tasks.map((task) => <li key={task.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><Link href={jobHref(task.job)} className="font-semibold hover:text-ember">{task.title}</Link><p className="text-sm text-mist">{task.job?.jobNumber ?? "Job"} · {task.job?.customerName ?? "Assigned work"} · {formatStatus(task.status)}{task.dueAt ? ` · Due ${fmtCalendarDate(task.dueAt)}` : ""}</p>{task.details && <p className="mt-1 break-words text-sm text-mist-strong">{task.details}</p>}</div><div className="flex shrink-0 gap-2">{task.status === "blocked" ? <button className="btn btn-ghost h-10 min-h-0 px-3" disabled={updateTask.isPending} onClick={() => updateTask.mutate({ id: task.id, status: "open" })}>Reopen</button> : <button className="btn btn-ghost h-10 min-h-0 px-3" disabled={updateTask.isPending} onClick={() => updateTask.mutate({ id: task.id, status: "blocked" })}>Mark blocked</button>}<button className="btn btn-primary h-10 min-h-0 px-3" disabled={updateTask.isPending} onClick={() => updateTask.mutate({ id: task.id, status: "done" })}>Mark done</button></div></li>)}</Queue></div>
    </div>
    {updateTask.isError && <p role="alert" className="text-sm text-bad">{(updateTask.error as Error).message}</p>}
    <p className="text-xs text-mist">Job assignments and task actions are recorded for review. Do not approve payments, sign waivers, or change company access from this workspace.</p>
  </div>;
}
