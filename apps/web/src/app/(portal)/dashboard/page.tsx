"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { JOB_STAGES, type JobDTO } from "@roofdesk/shared";
import { ReportsPanel } from "@/components/portal/ReportsPanel";
import { OperationsDashboard } from "@/components/portal/OperationsDashboard";
import { StageBadge } from "@/components/portal/StageBadge";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useJobStageLabels } from "@/lib/jobStages";
import { useI18n } from "@/lib/i18n";

export default function DashboardPage() {
  const { user, can } = useAuth();
  const { t } = useI18n();
  const stageLabels = useJobStageLabels();
  const summary = useQuery({ queryKey: ["jobs", "summary"], queryFn: () => api<{ total: number; byStage: Record<string, number> }>("/jobs/summary") });
  const recent = useQuery({ queryKey: ["jobs", "recent"], queryFn: () => api<{ items: JobDTO[] }>("/jobs?limit=6") });

  if (user?.role === "operations") return <OperationsDashboard />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold">{t("dashboard.welcome", { name: user?.name.split(" ")[0] ?? "" })}</h1>
        <p className="text-mist">{summary.data ? t("dashboard.jobsAcross", { count: summary.data.total }) : t("dashboard.loadingPipeline")}</p>
      </div>

      {can("report:view") && <ReportsPanel />}
      {can("ops:dashboard:view") && <OperationsDashboard managerView />}

      <section aria-labelledby="pipeline">
        <h2 id="pipeline" className="mb-3 text-xl font-bold">{t("dashboard.pipeline")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {JOB_STAGES.map((s) => (
            <Link key={s} href={`/jobs?stage=${s}`} className="panel p-4 hover:border-ember">
              <p className="font-display text-3xl font-bold">{summary.data?.byStage[s] ?? "-"}</p>
              <p className="text-sm text-mist">{stageLabels[s]}</p>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="recent">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="recent" className="text-xl font-bold">{t("dashboard.recentJobs")}</h2>
          <Link href="/jobs" className="text-sm font-semibold text-ember hover:underline">{t("dashboard.viewAll")}</Link>
        </div>
        <div className="panel divide-y divide-ink-600">
          {recent.data?.items.length === 0 && (
            <p className="p-6 text-mist">{t("dashboard.noJobs")} <Link href="/jobs" className="font-semibold text-ember">{t("dashboard.createFirst")}</Link> {t("dashboard.toMeasure")}</p>
          )}
          {recent.data?.items.map((j) => (
            <Link key={j.id} href={`/jobs/${j.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-ink-700">
              <div className="min-w-0">
                <p className="truncate font-medium">{j.customer.name}</p>
                <p className="truncate text-sm text-mist">{[j.property.line1, j.property.locality, j.property.city, j.property.district, j.property.state, j.property.country === "IN" ? j.property.pinCode : j.property.zip].filter(Boolean).join(", ")}</p>
              </div>
              <StageBadge stage={j.stage} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
