import crypto from "node:crypto";
import {
  isExpired,
  milestoneReadiness,
  type MilestoneDTO,
  type PartyDTO,
  type WaiverDTO,
  type WaiverStatus,
} from "@roofdesk/shared";
import { PaymentMilestone } from "../../models/PaymentMilestone";
import { Party } from "../../models/Party";
import { Waiver } from "../../models/Waiver";

export const toPartyDTO = (p: any): PartyDTO => ({
  id: p.id,
  type: p.type,
  name: p.name,
  contactName: p.contactName ?? undefined,
  email: p.email ?? undefined,
  phone: p.phone ?? undefined,
  contractAmountCents: p.contractAmountCents,
  requiresWaiver: p.requiresWaiver,
});

/** "expired" is derived from the expiry date, so a lapsed link needs no background job to be correct. */
export const effectiveStatus = (w: any): WaiverStatus => (isExpired(w.status, w.expiresAt) ? "expired" : w.status);

export const toWaiverDTO = (w: any): WaiverDTO => ({
  id: w.id,
  milestoneId: String(w.milestoneId),
  partyId: String(w.partyId),
  type: w.type,
  status: effectiveStatus(w),
  amountCents: w.amountCents,
  throughDate: w.throughDate.toISOString(),
  expiresAt: w.expiresAt?.toISOString(),
  requestedAt: w.requestedAt.toISOString(),
  viewedAt: w.viewedAt?.toISOString(),
  signedAt: w.signedAt?.toISOString(),
  signerName: w.signerName ?? undefined,
  declineReason: w.declineReason ?? undefined,
  documentHash: w.documentHash ?? undefined,
  templateVersion: w.templateVersion,
  needsReview: w.needsReview ?? [],
});

/** Fingerprint of everything that makes a waiver binding. Recomputed on demand to detect tampering. */
export function computeDocHash(w: any): string {
  const sig = w.signatureImage ? crypto.createHash("sha256").update(w.signatureImage).digest("hex") : "";
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ text: w.renderedText, type: w.type, amount: w.amountCents, through: w.throughDate.toISOString(), signer: w.signerName, at: w.signedAt?.toISOString(), sig }))
    .digest("hex");
}

export async function milestoneDTOs(jobId: string): Promise<MilestoneDTO[]> {
  const [milestones, parties, waivers] = await Promise.all([
    PaymentMilestone.find({ jobId }).sort({ createdAt: 1 }),
    Party.find({ jobId }),
    Waiver.find({ jobId }),
  ]);
  const rp = parties.map((p) => ({ id: p.id, name: p.name, requiresWaiver: p.requiresWaiver }));
  const rw = waivers.map((w) => ({ partyId: String(w.partyId), type: w.type as any, status: w.status }));
  // The waiver's own milestone must match, so filter per milestone before checking readiness.
  return milestones.map((m) => ({
    id: m.id,
    label: m.label,
    type: m.type as any,
    expectedAmountCents: m.expectedAmountCents,
    dueDate: m.dueDate?.toISOString(),
    requireWaivers: m.requireWaivers,
    status: m.status as any,
    readiness: milestoneReadiness(
      { type: m.type as any, requireWaivers: m.requireWaivers },
      rp,
      rw.filter((_, i) => String(waivers[i]!.milestoneId) === m.id),
    ),
    overrideNote: m.overrideNote ?? undefined,
  }));
}
