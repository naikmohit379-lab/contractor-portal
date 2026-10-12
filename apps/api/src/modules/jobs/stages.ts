import { JOB_STAGES, type JobStage } from "@roofdesk/shared";
import { Job } from "../../models/Job";

/** Moves a job forward to `stage`, never backward, so later workflow events cannot undo progress. */
export async function advanceStage(jobId: unknown, stage: JobStage) {
  const target = JOB_STAGES.indexOf(stage);
  const behind = JOB_STAGES.slice(0, target);
  await Job.updateOne({ _id: jobId, stage: { $in: behind } }, { stage });
}
