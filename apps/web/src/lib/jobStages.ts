"use client";

import { useQuery } from "@tanstack/react-query";
import { STAGE_LABELS, type JobStageLabels } from "@roofdesk/shared";
import { api } from "@/lib/api";

export function useJobStageLabels(): JobStageLabels {
  const query = useQuery({
    queryKey: ["job-stage-labels"],
    queryFn: () => api<{ stageLabels: JobStageLabels }>("/jobs/stage-labels"),
    staleTime: 5 * 60 * 1000,
  });
  return query.data?.stageLabels ?? STAGE_LABELS;
}
