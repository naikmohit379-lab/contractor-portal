"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { JOB_STAGES, JOB_TYPES, jobCreateSchema, type JobCreateInput, type JobDTO, type JobStage } from "@roofdesk/shared";
import { StageBadge } from "@/components/portal/StageBadge";
import { ApiError, api, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useJobStageLabels } from "@/lib/jobStages";

function NewJobForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, setError, formState: { errors } } = useForm<JobCreateInput>({
    resolver: zodResolver(jobCreateSchema),
    defaultValues: { type: "insurance" },
  });
  const create = useMutation({
    mutationFn: (v: JobCreateInput) => post<JobDTO>("/jobs", v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      onDone();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 422) setError("root", { message: e.message });
      else setError("root", { message: e instanceof Error ? e.message : "Could not create the job" });
    },
  });

  const text = (name: any, label: string, props: Record<string, string> = {}, err?: string) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} className="field" {...props} {...register(name)} />
      {err && <p className="field-error">{err}</p>}
    </div>
  );

  return (
    <form onSubmit={handleSubmit((v) => create.mutate(v))} className="panel space-y-4 p-5" noValidate>
      <h2 className="text-2xl font-bold">New job</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {text("customer.name", "Customer name", { autoComplete: "off" }, errors.customer?.name?.message)}
        {text("customer.phone", "Phone", { type: "tel", inputMode: "tel" })}
        {text("customer.email", "Email", { type: "email", inputMode: "email" }, errors.customer?.email?.message)}
        <div>
          <label className="label" htmlFor="type">Job type</label>
          <select id="type" className="field" {...register("type")}>
            {JOB_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t[0]!.toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[2fr_1.2fr_.6fr_.8fr]">
        {text("property.line1", "Street address", { autoComplete: "street-address" }, errors.property?.line1?.message)}
        {text("property.city", "City", {}, errors.property?.city?.message)}
        {text("property.state", "State", { maxLength: "2", autoCapitalize: "characters" }, errors.property?.state?.message)}
        {text("property.zip", "ZIP", { inputMode: "numeric", autoComplete: "postal-code" }, errors.property?.zip?.message)}
      </div>
      {errors.root && <p role="alert" className="rounded-md bg-bad/10 p-3 text-sm text-bad">{errors.root.message}</p>}
      <div className="flex gap-3">
        <button className="btn btn-primary" disabled={create.isPending}>{create.isPending ? "Creating job" : "Create job"}</button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

function JobsList() {
  const { can } = useAuth();
  const stageLabels = useJobStageLabels();
  const params = useSearchParams();
  const [stage, setStage] = useState<JobStage | "">((params.get("stage") as JobStage) ?? "");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);

  const jobs = useQuery({
    queryKey: ["jobs", "list", stage, q],
    queryFn: () => api<{ items: JobDTO[] }>(`/jobs?limit=50${stage ? `&stage=${stage}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-4xl font-bold">Jobs</h1>
        {can("job:write") && !creating && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={18} aria-hidden /> New job</button>
        )}
      </div>

      {creating && <NewJobForm onDone={() => setCreating(false)} />}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-mist" aria-hidden />
          <input className="field pl-10" placeholder="Search customer, address or job number" aria-label="Search jobs" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="field sm:w-56" aria-label="Filter by stage" value={stage} onChange={(e) => setStage(e.target.value as JobStage | "")}>
          <option value="">All stages</option>
          {JOB_STAGES.map((s) => <option key={s} value={s}>{stageLabels[s]}</option>)}
        </select>
      </div>

      <div className="panel divide-y divide-ink-600">
        {jobs.isLoading && <p className="p-6 text-mist">Loading jobs</p>}
        {jobs.isError && <p className="p-6 text-bad">Jobs could not be loaded. Refresh to try again.</p>}
        {jobs.data?.items.length === 0 && <p className="p-6 text-mist">No jobs match. Change the filters or create a new job.</p>}
        {jobs.data?.items.map((j) => (
          <Link key={j.id} href={`/jobs/${j.id}`} className="flex flex-col gap-2 p-4 hover:bg-ink-700 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium">{j.customer.name} <span className="ml-2 text-xs text-mist">{j.jobNumber}</span></p>
              <p className="truncate text-sm text-mist">{j.property.line1}, {j.property.city}, {j.property.state} {j.property.zip}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs capitalize text-mist">{j.type}</span>
              <StageBadge stage={j.stage} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={<p className="text-mist">Loading jobs</p>}>
      <JobsList />
    </Suspense>
  );
}
