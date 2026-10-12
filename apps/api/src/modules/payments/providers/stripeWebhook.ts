import crypto from "node:crypto";
import type { NormalizedEvent } from "./types";

export class WebhookError extends Error {}

/**
 * Verifies a Stripe-Signature header: `t=<unix seconds>,v1=<hex hmac>[,v1=...]`.
 * The HMAC is SHA-256 over `<t>.<raw body>` with the endpoint's signing secret. Old timestamps are rejected
 * so a captured request cannot be replayed later. Must be given the RAW body, not parsed JSON.
 */
export function verifyStripeSignature(rawBody: Buffer | string, header: string | undefined, secret: string, toleranceSec = 300, nowMs = Date.now()) {
  if (!header) throw new WebhookError("Missing signature header");
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=");
    if (k === "t" && v) timestamp = v;
    if (k === "v1" && v) signatures.push(v);
  }
  if (!timestamp || signatures.length === 0) throw new WebhookError("Malformed signature header");
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > toleranceSec) throw new WebhookError("Signature timestamp outside tolerance");

  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest("hex");
  const ok = signatures.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
  if (!ok) throw new WebhookError("Signature does not match");
}

/** Maps the Stripe events we care about to gateway-neutral events. Anything else is ignored (returns null). */
export function normalizeStripeEvent(evt: any): NormalizedEvent | null {
  const obj = evt?.data?.object ?? {};
  const base = { eventId: String(evt?.id), provider: "stripe" };
  switch (evt?.type) {
    case "checkout.session.completed":
      return {
        ...base,
        type: obj.payment_status === "paid" ? "payment_succeeded" : "payment_processing", // bank debits settle later
        paymentId: obj.metadata?.paymentId ?? obj.client_reference_id,
        paymentIntentId: obj.payment_intent ?? undefined,
        amountCents: obj.amount_total,
        currency: obj.currency,
      };
    case "checkout.session.async_payment_succeeded":
      return { ...base, type: "payment_succeeded", paymentId: obj.metadata?.paymentId ?? obj.client_reference_id, paymentIntentId: obj.payment_intent ?? undefined, amountCents: obj.amount_total, currency: obj.currency };
    case "checkout.session.async_payment_failed":
      return { ...base, type: "payment_failed", paymentId: obj.metadata?.paymentId ?? obj.client_reference_id, paymentIntentId: obj.payment_intent ?? undefined, failureReason: "The bank payment failed" };
    case "checkout.session.expired":
      return { ...base, type: "payment_failed", paymentId: obj.metadata?.paymentId ?? obj.client_reference_id, failureReason: "The checkout expired before payment" };
    case "payment_intent.payment_failed":
      return { ...base, type: "payment_failed", paymentId: obj.metadata?.paymentId, paymentIntentId: obj.id, failureReason: obj.last_payment_error?.message ?? "The payment was declined" };
    case "charge.refunded":
      return { ...base, type: "refund_total", paymentIntentId: obj.payment_intent ?? undefined, amountCents: obj.amount_refunded, currency: obj.currency };
    case "charge.dispute.created":
      return { ...base, type: "dispute_opened", paymentIntentId: obj.payment_intent ?? undefined };
    default:
      return null;
  }
}
