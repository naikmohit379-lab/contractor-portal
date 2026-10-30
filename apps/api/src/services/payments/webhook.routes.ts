import type { RequestHandler } from "express";
import { env } from "../../config/env";
import { logger } from "../../core/logger";
import { applyProviderEvent } from "./service";
import { normalizeStripeEvent, verifyStripeSignature, WebhookError } from "./providers/stripeWebhook";

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
