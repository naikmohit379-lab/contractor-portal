import type { RequestHandler } from "express";
import { env } from "../../config/env";
import { logger } from "../../core/logger";
import { applyProviderEvent } from "./service";
import { normalizeStripeEvent, verifyStripeSignature, WebhookError } from "./providers/stripeWebhook";
import { isValidObjectId } from "mongoose";
import { Company } from "../../models/Company";
import { Payment } from "../../models/Payment";
import { decryptRazorpaySecret, normalizeRazorpayEvent, verifyRazorpayWebhook } from "./razorpay";
import { asyncHandler } from "../../core/http";

/**
 * POST /api/v1/webhooks/stripe. Mounted BEFORE the JSON body parser: the signature is computed over the
 * exact raw bytes, so the body must not be parsed first. Not authenticated by login: the signature is the credential.
 */
export const stripeWebhookHandler: RequestHandler = async (req, res) => {
  if (!env.STRIPE_WEBHOOK_SECRET) return void res.status(503).json({ error: { code: "not_configured", message: "Webhook secret is not set" } });

  try {
    verifyStripeSignature(req.body as Buffer, req.header("stripe-signature"), env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const reason = err instanceof WebhookError ? err.message : "invalid";
    logger.warn({ reason }, "rejected webhook");
    return void res.status(400).json({ error: { code: "bad_signature", message: reason } });
  }

  try {
    const event = normalizeStripeEvent(JSON.parse((req.body as Buffer).toString("utf8")));
    if (!event) return void res.json({ received: true, ignored: true });
    const outcome = await applyProviderEvent(event);
    if (outcome === "unmatched") logger.warn({ eventId: event.eventId, type: event.type }, "webhook did not match a payment");
    res.json({ received: true, outcome });
  } catch (err) {
    // A 500 makes the gateway retry later, which is what we want for a transient failure.
    logger.error({ err }, "webhook processing failed");
    res.status(500).json({ error: { code: "processing_failed", message: "Try again" } });
  }
};

/** Per-company callback path selects that merchant's secret; the signature over raw bytes authenticates the request. */
export const razorpayWebhookHandler: RequestHandler = asyncHandler(async (req, res) => {
  if (!env.RAZORPAY_API_ENABLED || !isValidObjectId(req.params.companyId)) return void res.status(404).json({ error: { code: "not_found", message: "Webhook endpoint not found" } });
  const company = await Company.findById(req.params.companyId).select("+settings.razorpayTest.encryptedWebhookSecret");
  const encryptedSecret = company?.settings?.razorpayTest?.encryptedWebhookSecret;
  if (!company || !encryptedSecret) return void res.status(404).json({ error: { code: "not_found", message: "Webhook endpoint not found" } });
  let secret: string;
  try { secret = decryptRazorpaySecret(encryptedSecret); } catch { return void res.status(503).json({ error: { code: "not_configured", message: "Webhook credentials are unavailable" } }); }
  if (!verifyRazorpayWebhook(req.body as Buffer, req.header("x-razorpay-signature"), secret)) {
    logger.warn({ companyId: company.id }, "rejected Razorpay webhook signature");
    return void res.status(400).json({ error: { code: "bad_signature", message: "Webhook signature does not match" } });
  }
  const eventId = req.header("x-razorpay-event-id");
  if (!eventId || eventId.length > 160) return void res.status(400).json({ error: { code: "missing_event_id", message: "Razorpay event id is required" } });
  try {
    const payload = JSON.parse((req.body as Buffer).toString("utf8"));
    const event = normalizeRazorpayEvent(payload, eventId);
    if (!event) return void res.json({ received: true, ignored: true });
    let payment: any;
    if (isValidObjectId(event.internalPaymentId)) payment = await Payment.findOne({ _id: event.internalPaymentId, companyId: company._id }).setOptions({ skipTenant: true });
    if (!payment && event.linkId) payment = await Payment.findOne({ providerSessionId: event.linkId, companyId: company._id }).setOptions({ skipTenant: true });
    if (!payment && event.providerPaymentId) payment = await Payment.findOne({ providerPaymentIntentId: event.providerPaymentId, companyId: company._id }).setOptions({ skipTenant: true });
    if (!payment || payment.provider !== "razorpay-test") return void res.json({ received: true, outcome: "unmatched" });
    const amountCents = event.type === "refund_total" ? payment.refundedCents + (event.refundAmountPaise ?? 0) : event.type === "payment_succeeded" ? event.amountPaise : undefined;
    const outcome = await applyProviderEvent({
      eventId,
      provider: `razorpay-test:${company.id}`,
      type: event.type,
      paymentId: payment.id,
      paymentIntentId: event.providerPaymentId || undefined,
      amountCents,
      currency: event.type === "payment_succeeded" || event.type === "refund_total" ? event.currency : undefined,
      failureReason: event.type === "payment_failed" ? event.failureReason : undefined,
    });
    res.json({ received: true, outcome });
  } catch (err) {
    logger.error({ err, companyId: company.id }, "Razorpay webhook processing failed");
    res.status(500).json({ error: { code: "processing_failed", message: "Try again" } });
  }
});
