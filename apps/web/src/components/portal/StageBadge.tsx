import clsx from "clsx";
import { STAGE_LABELS, type JobStage } from "@roofdesk/shared";

const TONE: Partial<Record<JobStage, string>> = {
  lead: "bg-ink-600 text-mist-strong",
  measured: "bg-sky-400/15 text-sky-300",
  estimated: "bg-sky-400/15 text-sky-300",
  claim_filed: "bg-warn/15 text-warn",
  approved: "bg-ok/15 text-ok",
  materials_ordered: "bg-ember/15 text-ember-300",
  in_progress: "bg-ember/15 text-ember-300",
  complete: "bg-ok/15 text-ok",
  paid: "bg-ok/25 text-ok",
};

export function StageBadge({ stage }: { stage: JobStage }) {
  return <span className={clsx("inline-block whitespace-nowrap rounded px-2 py-1 text-xs font-semibold", TONE[stage])}>{STAGE_LABELS[stage]}</span>;
}
