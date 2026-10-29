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
import { useI18n } from "@/lib/i18n";

function NewJobForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { t, validation } = useI18n();
  const country = user?.company.settings?.country ?? "US";
  const { register, handleSubmit, setError, watch, formState: { errors } } = useForm<JobCreateInput>({
    resolver: zodResolver(jobCreateSchema),
    defaultValues: { type: "insurance", property: { country } },
    shouldUnregister: true,
  });
  const selectedCountry = watch("property.country") ?? country;
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
      {err && <p className="field-error">{validation(err)}</p>}
    </div>
  );

  return (
    <form onSubmit={handleSubmit((v) => create.mutate(v))} className="panel space-y-4 p-5" noValidate>
      <h2 className="text-2xl font-bold">{t("jobs.new")}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {text("customer.name", t("jobs.customerName"), { autoComplete: "off" }, errors.customer?.name?.message)}
        {text("customer.phone", t("jobs.phone"), { type: "tel", inputMode: "tel" })}
        {text("customer.email", t("jobs.email"), { type: "email", inputMode: "email" }, errors.customer?.email?.message)}
        <div>
          <label className="label" htmlFor="type">{t("jobs.jobType")}</label>
          <select id="type" className="field" {...register("type")}>
            {JOB_TYPES.map((kind) => <option key={kind} value={kind}>{t(({ insurance: "jobs.type.insurance", retail: "jobs.type.retail", commercial: "jobs.type.commercial" } as const)[kind])}</option>)}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="property.country">{t("jobs.country")}</label>
          <select id="property.country" className="field" {...register("property.country")}>
            <option value="IN">{t("jobs.countryIndia")}</option>
            <option value="US">{t("jobs.countryUs")}</option>
          </select>
        </div>
        {text("property.line1", t("jobs.addressLine1"), { autoComplete: "address-line1" }, errors.property?.line1?.message)}
        {text("property.line2", t("jobs.addressLine2"), { autoComplete: "address-line2" })}
        {text("property.city", t("jobs.city"), {}, errors.property?.city?.message)}
        {text("property.district", t("jobs.district"), {}, errors.property?.district?.message)}
        {text("property.state", selectedCountry === "IN" ? t("jobs.stateIndia") : t("jobs.stateUs"), selectedCountry === "IN" ? {} : { maxLength: "2", autoCapitalize: "characters" }, errors.property?.state?.message)}
        {selectedCountry === "IN" ? text("property.pinCode", t("jobs.pinCode"), { inputMode: "numeric", autoComplete: "postal-code", maxLength: "6" }, errors.property?.pinCode?.message) : text("property.zip", t("jobs.zip"), { inputMode: "numeric", autoComplete: "postal-code" }, errors.property?.zip?.message)}
        {text("property.landmark", t("jobs.landmark"))}
      </div>
      {errors.root && <p role="alert" className="rounded-md bg-bad/10 p-3 text-sm text-bad">{errors.root.message}</p>}
      <div className="flex gap-3">
        <button className="btn btn-primary" disabled={create.isPending}>{create.isPending ? t("jobs.creating") : t("jobs.create")}</button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>{t("common.cancel")}</button>
      </div>
    </form>
  );
}

function JobsList() {
  const { can } = useAuth();
  const { t } = useI18n();
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
        <h1 className="text-4xl font-bold">{t("jobs.title")}</h1>
        {can("job:write") && !creating && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={18} aria-hidden /> {t("jobs.new")}</button>
        )}
      </div>

      {creating && <NewJobForm onDone={() => setCreating(false)} />}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-mist" aria-hidden />
          <input className="field pl-10" placeholder={t("jobs.search")} aria-label={t("jobs.searchLabel")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="field sm:w-56" aria-label={t("jobs.filterStage")} value={stage} onChange={(e) => setStage(e.target.value as JobStage | "")}>
          <option value="">{t("jobs.allStages")}</option>
          {JOB_STAGES.map((s) => <option key={s} value={s}>{stageLabels[s]}</option>)}
        </select>
      </div>

      <div className="panel divide-y divide-ink-600">
        {jobs.isLoading && <p className="p-6 text-mist">{t("jobs.loading")}</p>}
        {jobs.isError && <p className="p-6 text-bad">{t("jobs.loadError")}</p>}
        {jobs.data?.items.length === 0 && <p className="p-6 text-mist">{t("jobs.none")}</p>}
        {jobs.data?.items.map((j) => (
          <Link key={j.id} href={`/jobs/${j.id}`} className="flex flex-col gap-2 p-4 hover:bg-ink-700 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium">{j.customer.name} <span className="ml-2 text-xs text-mist">{j.jobNumber}</span></p>
              <p className="truncate text-sm text-mist">{[j.property.line1, j.property.line2, j.property.locality, j.property.city, j.property.district, j.property.state, j.property.country === "IN" ? j.property.pinCode : j.property.zip].filter(Boolean).join(", ")}</p>
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
