import { randomUUID } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { mockResultSchema, type PublicPaymentDTO } from "@roofdesk/shared";
import { env } from "../../config/env";
import { hashToken } from "../../core/auth";
import { AppError, notFound } from "../../core/errors";
import { asyncHandler, validate } from "../../core/http";
import { Company } from "../../models/Company";
import { Payment } from "../../models/Payment";
import { getPaymentProvider } from "./providers";
import { applyProviderEvent } from "./service";

/**
 * The payer's link. The secret in the URL is the credential (stored hashed, rate limited).
 * The payer always pays on the gateway's hosted page; this API never sees card or bank details.
 */
export const publicPaymentsRouter = Router();
publicPaymentsRouter.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false }));

async function byToken(token: string) {
  const p = await Payment.findOne({ tokenHash: hashToken(token) }).setOptions({ skipTenant: true });
  if (!p) throw notFound("Payment link");
  return p;
}

publicPaymentsRouter.get(
  "/payments/:token",
  asyncHandler(async (req, res) => {
    const p = await byToken(req.params.token!);
    const company = await Company.findById(p.companyId);
    const dto: PublicPaymentDTO = {
      company: company?.name ?? "",
      description: p.description,
      amountCents: p.amountCents,
      currency: p.currency ?? company?.settings?.currency ?? "USD",
      locale: company?.settings?.locale ?? "en-US",
      timezone: company?.settings?.timezone ?? "America/Chicago",
      status: p.status as any,
      payerName: p.payerName,
      provider: p.provider ?? env.PAYMENT_PROVIDER,
      paidAt: p.paidAt?.toISOString(),
    };
    res.json(dto);
  }),
);

publicPaymentsRouter.post(
  "/payments/:token/checkout",
  asyncHandler(async (req, res) => {
    const p = await byToken(req.params.token!);
    if (!["requested", "pending", "failed"].includes(p.status)) throw new AppError(409, "not_payable", `This payment is ${p.status}`);

    // A new attempt gets a new idempotency key, so a retry after an expired session is not answered with the old session.
    p.checkoutAttempts += 1;
    const base = `${env.WEB_ORIGIN}/pay/${req.params.token}`;
    const session = await getPaymentProvider().createCheckout({
      paymentId: p.id,
      amountCents: p.amountCents,
      currency: p.currency,
      description: p.description,
      customerEmail: p.payerEmail ?? undefined,
      successUrl: `${base}?returned=1`,
      cancelUrl: base,
      idempotencyKey: `checkout-${p.id}-${p.checkoutAttempts}`,
    });
    p.providerSessionId = session.sessionId;
    p.provider = getPaymentProvider().name;
    if (session.paymentIntentId) p.providerPaymentIntentId = session.paymentIntentId;
    await p.save();
    res.json({ url: session.url });
  }),
);

/**
 * Local development only: stands in for the gateway's webhook so the whole flow can be tried without
 * a gateway account. It goes through the same event handler as a real webhook. Disabled for real gateways.
 */
publicPaymentsRouter.post(
  "/payments/:token/mock-result",
  validate({ body: mockResultSchema }),
  asyncHandler(async (req, res) => {
    if (env.PAYMENT_PROVIDER !== "mock") throw notFound("Route");
    const p = await byToken(req.params.token!);
    const outcome = await applyProviderEvent({
      eventId: `mock_evt_${randomUUID()}`,
      provider: "mock",
      type: req.body.outcome === "success" ? "payment_succeeded" : "payment_failed",
      paymentId: p.id,
      paymentIntentId: `mock_pi_${p.id}`,
      amountCents: p.amountCents,
      currency: p.currency,
      failureReason: "The card was declined (simulated)",
    });
    res.json({ outcome });
  }),
);
