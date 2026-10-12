import { z } from "zod";

export const CLAIM_STATUSES = [
  "draft",
  "submitted",
  "inspection_scheduled",
  "approved",
  "partially_approved",
  "denied",
  "supplement_filed",
  "closed",
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  inspection_scheduled: "Inspection scheduled",
  approved: "Approved",
  partially_approved: "Partially approved",
  denied: "Denied",
  supplement_filed: "Supplement filed",
  closed: "Closed",
};

/** Allowed moves. The API enforces this; the UI only offers the moves listed here. */
export const CLAIM_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  draft: ["submitted"],
  submitted: ["inspection_scheduled", "approved", "partially_approved", "denied"],
  inspection_scheduled: ["approved", "partially_approved", "denied"],
  approved: ["supplement_filed", "closed"],
  partially_approved: ["supplement_filed", "closed"],
  denied: ["supplement_filed", "closed"],
  supplement_filed: ["approved", "partially_approved", "denied", "closed"],
  closed: [],
};
export const canTransitionClaim = (from: ClaimStatus, to: ClaimStatus) => CLAIM_TRANSITIONS[from].includes(to);

const adjuster = z.object({
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.union([z.string().trim().toLowerCase().email("Enter a valid email address"), z.literal("")]).optional(),
});

export const claimCreateSchema = z.object({
  carrier: z.string().trim().min(2, "Enter the insurance carrier").max(120),
  policyNo: z.string().trim().min(1, "Enter the policy number").max(60),
  claimNo: z.string().trim().min(1, "Enter the claim number").max(60),
  dateOfLoss: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Enter the date of loss"),
  adjuster: adjuster.optional(),
  deductibleCents: z.number().int().min(0).default(0),
});
export type ClaimCreateInput = z.input<typeof claimCreateSchema>;

export const claimUpdateSchema = claimCreateSchema.partial();

export const claimStatusSchema = z.object({
  status: z.enum(CLAIM_STATUSES),
  note: z.string().trim().max(500).optional(),
  approvedAmountCents: z.number().int().min(0).optional(),
});

export const COMM_CHANNELS = ["email", "call", "note", "meeting"] as const;
export const communicationSchema = z.object({
  channel: z.enum(COMM_CHANNELS),
  direction: z.enum(["inbound", "outbound"]),
  body: z.string().trim().min(2, "Write what was said or sent").max(4000),
});

export interface ClaimDTO {
  id: string;
  jobId: string;
  carrier: string;
  policyNo: string;
  claimNo: string;
  dateOfLoss: string;
  adjuster: { name?: string; phone?: string; email?: string };
  deductibleCents: number;
  status: ClaimStatus;
  approvedAmountCents?: number;
  statusHistory: { from?: ClaimStatus; to: ClaimStatus; at: string; note?: string }[];
  createdAt: string;
}

export interface CommunicationDTO {
  id: string;
  channel: (typeof COMM_CHANNELS)[number];
  direction: "inbound" | "outbound";
  body: string;
  createdAt: string;
}
