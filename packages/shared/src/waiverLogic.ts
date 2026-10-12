// Pure waiver rules shared by the API and the web app. No dependencies, so they are easy to test.

export const WAIVER_TYPES = ["conditional_progress", "unconditional_progress", "conditional_final", "unconditional_final"] as const;
export type WaiverType = (typeof WAIVER_TYPES)[number];

export const WAIVER_TYPE_LABELS: Record<WaiverType, string> = {
  conditional_progress: "Conditional waiver on progress payment",
  unconditional_progress: "Unconditional waiver on progress payment",
  conditional_final: "Conditional waiver on final payment",
  unconditional_final: "Unconditional waiver on final payment",
};

export const MILESTONE_TYPES = ["deposit", "progress", "final"] as const;
export type MilestoneType = (typeof MILESTONE_TYPES)[number];

/** A deposit or progress draw is covered by a progress waiver; the last payment needs a final waiver. */
export const acceptableWaiverTypes = (m: MilestoneType): WaiverType[] =>
  m === "final" ? ["conditional_final", "unconditional_final"] : ["conditional_progress", "unconditional_progress"];

/** Before payment you collect the conditional form; the unconditional form follows once the money has cleared. */
export const defaultRequestType = (m: MilestoneType): WaiverType => (m === "final" ? "conditional_final" : "conditional_progress");

export interface ReadinessParty {
  id: string;
  name: string;
  requiresWaiver: boolean;
}
export interface ReadinessWaiver {
  partyId: string;
  type: WaiverType;
  status: string; // only "signed" counts
}

export interface Readiness {
  ready: boolean;
  required: number;
  signed: number;
  missing: { partyId: string; name: string }[];
}

/** A payment is ready when every party that must sign has a signed waiver of the right kind for it. */
export function milestoneReadiness(
  milestone: { type: MilestoneType; requireWaivers: boolean },
  parties: ReadinessParty[],
  waivers: ReadinessWaiver[],
): Readiness {
  if (!milestone.requireWaivers) return { ready: true, required: 0, signed: 0, missing: [] };
  const ok = new Set(acceptableWaiverTypes(milestone.type));
  const needed = parties.filter((p) => p.requiresWaiver);
  const missing = needed
    .filter((p) => !waivers.some((w) => w.partyId === p.id && w.status === "signed" && ok.has(w.type)))
    .map((p) => ({ partyId: p.id, name: p.name }));
  return { ready: missing.length === 0, required: needed.length, signed: needed.length - missing.length, missing };
}

/** Soft check used at signing: does the typed name look like the party we asked? */
export function namesMatch(typed: string, expected: string[]): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const t = norm(typed);
  return expected.filter(Boolean).some((e) => {
    const n = norm(e);
    return n === t || (n.length > 3 && (n.includes(t) || t.includes(n)) && t.length > 3);
  });
}

export const isExpired = (status: string, expiresAt?: string | Date | null, now = new Date()) =>
  (status === "requested" || status === "viewed") && !!expiresAt && new Date(expiresAt).getTime() < now.getTime();
