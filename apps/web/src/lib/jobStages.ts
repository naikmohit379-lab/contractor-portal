"use client";

import { useQuery } from "@tanstack/react-query";
import { STAGE_LABELS, type JobStageLabels } from "@roofdesk/shared";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export function useJobStageLabels(): JobStageLabels {
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ["job-stage-labels"],
    queryFn: () => api<{ stageLabels: JobStageLabels }>("/jobs/stage-labels"),
    staleTime: 5 * 60 * 1000,
  });
  const labels = query.data?.stageLabels ?? STAGE_LABELS;
  return Object.fromEntries(Object.entries(labels).map(([stage, label]) => [
    stage,
    label === STAGE_LABELS[stage as keyof JobStageLabels] ? t(("stage." + stage) as Parameters<typeof t>[0]) : label,
  ])) as JobStageLabels;
}
