import { z } from "zod";
import { MILESTONE_TYPES, WAIVER_TYPES, type MilestoneType, type Readiness, type WaiverType } from "./waiverLogic";

const optionalEmail = z.union([z.string().trim().toLowerCase().email("Enter a valid email address"), z.literal("")]).optional();
const isoDate = (msg: string) => z.string().refine((s) => !Number.isNaN(Date.parse(s)), msg);

export const PARTY_TYPES = ["subcontractor", "supplier", "general_contractor"] as const;
export const partySchema = z.object({
  type: z.enum(PARTY_TYPES),
  name: z.string().trim().min(2, "Enter the company or person name").max(120),
  contactName: z.string().trim().max(120).optional(),
  email: optionalEmail,
  phone: z.string().trim().max(30).optional(),
  contractAmountCents: z.number().int().min(0).default(0),
  requiresWaiver: z.boolean().default(true),
});
export type PartyInput = z.input<typeof partySchema>;
export const partyUpdateSchema = partySchema.partial();

export const milestoneSchema = z.object({
  label: z.string().trim().min(2, "Name this payment").max(100),
  type: z.enum(MILESTONE_TYPES),
  expectedAmountCents: z.number().int().min(0),
  dueDate: isoDate("Enter a valid date").optional(),
  requireWaivers: z.boolean().default(true),
});
export type MilestoneInput = z.input<typeof milestoneSchema>;
export const milestoneUpdateSchema = milestoneSchema.partial();
export const markReadySchema = z.object({
  // Required when company gating is "warn" and waivers are missing: the user confirms they are releasing anyway.
  overrideMissing: z.boolean().optional(),
  reason: z.string().trim().max(300).optional(),
});

export const waiverRequestSchema = z.object({
  milestoneId: z.string().min(1),
  partyId: z.string().min(1),
  type: z.enum(WAIVER_TYPES),
  amountCents: z.number().int().min(0),
  throughDate: isoDate("Enter the through date"),
  expiresInDays: z.number().int().min(1).max(90).default(14),
});
export const waiverBulkSchema = z.object({
  milestoneId: z.string().min(1),
  type: z.enum(WAIVER_TYPES).optional(),
  throughDate: isoDate("Enter the through date"),
  expiresInDays: z.number().int().min(1).max(90).default(14),
});

export const templateUpdateSchema = z.object({ body: z.string().trim().min(80, "The form text is too short").max(6000) });

export const signSchema = z.object({
  signerName: z.string().trim().min(2, "Type your full legal name").max(120),
  consent: z.literal(true, { errorMap: () => ({ message: "Confirm that you agree to sign electronically" }) }),
  // PNG data URL drawn on the signature pad. Capped so a document cannot be bloated.
  signatureImage: z.string().max(200_000).regex(/^data:image\/png;base64,/, "Signature must be a PNG image").optional(),
});
export const declineSchema = z.object({ reason: z.string().trim().min(3, "Say why you cannot sign").max(500) });

export const WAIVER_STATUSES = ["requested", "viewed", "signed", "declined", "expired", "cancelled"] as const;
export type WaiverStatus = (typeof WAIVER_STATUSES)[number];

export const TEMPLATE_PLACEHOLDERS = ["partyName", "companyName", "ownerName", "propertyAddress", "jobNumber", "amount", "throughDate"] as const;

export interface PartyDTO {
  id: string;
  type: (typeof PARTY_TYPES)[number];
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  contractAmountCents: number;
  requiresWaiver: boolean;
}

export interface WaiverDTO {
  id: string;
  milestoneId: string;
  partyId: string;
  type: WaiverType;
  status: WaiverStatus; // "expired" is derived from the expiry date
  amountCents: number;
  throughDate: string;
  expiresAt?: string;
  requestedAt: string;
  viewedAt?: string;
  signedAt?: string;
  signerName?: string;
  declineReason?: string;
  documentHash?: string;
  templateVersion: number;
  needsReview: string[]; // soft validation flags raised at signing
}

export interface MilestoneDTO {
  id: string;
  label: string;
  type: MilestoneType;
  expectedAmountCents: number;
  dueDate?: string;
  requireWaivers: boolean;
  status: "pending" | "ready" | "paid";
  readiness: Readiness;
  overrideNote?: string;
}

export interface TemplateDTO {
  type: WaiverType;
  version: number;
  body: string;
  legalApproved: boolean;
  approvedAt?: string;
}

export interface PublicWaiverDTO {
  title: string;
  status: WaiverStatus;
  company: string;
  partyName: string;
  amountCents: number;
  throughDate: string;
  expiresAt?: string;
  text: string;
  signedAt?: string;
  documentHash?: string;
}
