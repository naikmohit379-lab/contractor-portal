import { JOB_STAGES, STAGE_LABELS, type JobStage, type JobStageLabels } from "@roofdesk/shared";
import { Job } from "../../models/Job";

export function normalizeStageLabels(value: unknown): JobStageLabels {
  const labels = value as { get?: (key: string) => unknown; [key: string]: unknown } | null | undefined;
  return Object.fromEntries(JOB_STAGES.map((stage) => {
    const configured = labels?.get?.(stage) ?? labels?.[stage];
    return [stage, typeof configured === "string" && configured.trim() ? configured.trim() : STAGE_LABELS[stage]];
  })) as JobStageLabels;
}

/** Moves a job forward to `stage`, never backward, so later workflow events cannot undo progress. */
export async function advanceStage(jobId: unknown, stage: JobStage) {
  const target = JOB_STAGES.indexOf(stage);
  const behind = JOB_STAGES.slice(0, target);
  await Job.updateOne({ _id: jobId, stage: { $in: behind } }, { stage });
}
