import { z } from "zod";

export const PAYMENT_STATUSES = ["requested", "pending", "succeeded", "failed", "partially_refunded", "refunded", "canceled"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  requested: "Awaiting payment",
  pending: "Processing",
  succeeded: "Paid",
  failed: "Failed",
  partially_refunded: "Partly refunded",
  refunded: "Refunded",
  canceled: "Canceled",
};

export const REFUND_STATUSES = ["pending_approval", "processing", "processed", "rejected", "failed"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const paymentRequestSchema = z.object({
  milestoneId: z.string().min(1, "Choose a payment"),
  amountCents: z.number().int().min(100, "The minimum payment is 1.00 major currency units").optional(), // USD cents or INR paise; default: whatever is still owed
  payerName: z.string().trim().min(2, "Enter the payer's name").max(120),
  payerEmail: z.union([z.string().trim().toLowerCase().email("Enter a valid email address"), z.literal("")]).optional(),
  razorpayPaymentUrl: z.string().trim().max(2048).url("Paste a valid Razorpay Payment Link").optional(),
});

export function isRazorpayPaymentLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "rzp.io" && !url.port && url.pathname.startsWith("/i/") && url.pathname.length > 3 && !url.username && !url.password;
  } catch {
    return false;
  }
}

export const recordExternalPaymentSchema = z.object({
  razorpayPaymentId: z.string().trim().min(4).max(100).regex(/^[A-Za-z0-9_-]+$/, "Enter the Payment ID shown in Razorpay"),
  amountCents: z.number().int().min(1),
  currency: z.string().trim().length(3).regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
  password: z.string().min(1, "Enter your password to confirm"),
  confirmedCaptured: z.literal(true),
});

// Refunds and refund approvals re-check the password: a stolen session alone cannot move money.
export const refundRequestSchema = z.object({
  amountCents: z.number().int().min(1, "Enter an amount"),
  reason: z.string().trim().min(3, "Say why you are refunding").max(300),
  password: z.string().min(1, "Enter your password to confirm"),
});
export const refundApproveSchema = z.object({ password: z.string().min(1, "Enter your password to confirm") });
export const refundRejectSchema = z.object({ reason: z.string().trim().min(3).max(300) });

export const mockResultSchema = z.object({ outcome: z.enum(["success", "failure"]) });

export interface PaymentDTO {
  id: string;
  jobId: string;
  milestoneId: string;
  description: string;
  amountCents: number;
  currency?: string;
  status: PaymentStatus;
  payerName: string;
  payerEmail?: string;
  method?: string;
  provider: string;
  externalPaymentUrl?: string;
  providerReference?: string;
  failureReason?: string;
  refundedCents: number;
  disputed: boolean;
  flag?: string; // e.g. "amount_mismatch": money arrived that does not match the request
  createdAt: string;
  paidAt?: string;
}

export interface RefundDTO {
  id: string;
  paymentId: string;
  amountCents: number;
  reason: string;
  status: RefundStatus;
  requestedAt: string;
  processedAt?: string;
  failureReason?: string;
}

export interface PublicPaymentDTO {
  company: string;
  description: string;
  amountCents: number;
  currency?: string;
  locale?: string;
  timezone?: string;
  status: PaymentStatus;
  payerName: string;
  provider: string;
  externalPaymentUrl?: string;
  paidAt?: string;
}

export interface ReconciliationException {
  paymentId?: string;
  jobId?: string;
  kind: string;
  message: string;
}
