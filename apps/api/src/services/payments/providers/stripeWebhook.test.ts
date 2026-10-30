import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeStripeEvent, verifyStripeSignature, WebhookError } from "./stripeWebhook";

const secret = "whsec_test";
const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { payment_status: "paid", amount_total: 50000, currency: "usd", payment_intent: "pi_1", metadata: { paymentId: "p1" } } } });
const now = Date.now();
const t = Math.floor(now / 1000);
const sig = (ts: number, b = body, s = secret) => `t=${ts},v1=${crypto.createHmac("sha256", s).update(`${ts}.${b}`).digest("hex")}`;

describe("Stripe signature check", () => {
  it("accepts a good signature, as text or raw bytes", () => {
    expect(() => verifyStripeSignature(body, sig(t), secret, 300, now)).not.toThrow();
    expect(() => verifyStripeSignature(Buffer.from(body), sig(t) + ",v1=deadbeef", secret, 300, now)).not.toThrow();
  });
  it.each([
    ["missing header", () => verifyStripeSignature(body, undefined, secret, 300, now)],
    ["wrong secret", () => verifyStripeSignature(body, sig(t, body, "whsec_other"), secret, 300, now)],
    ["tampered body", () => verifyStripeSignature(body + " ", sig(t), secret, 300, now)],
    ["replayed old request", () => verifyStripeSignature(body, sig(t - 1000), secret, 300, now)],
    ["malformed header", () => verifyStripeSignature(body, "garbage", secret, 300, now)],
  ])("rejects %s", (_name, fn) => {
    expect(fn).toThrow(WebhookError);
  });
});

describe("event mapping", () => {
  it("maps a paid checkout", () => {
    const n = normalizeStripeEvent(JSON.parse(body))!;
    expect([n.type, n.paymentId, n.amountCents, n.paymentIntentId, n.eventId]).toEqual(["payment_succeeded", "p1", 50000, "pi_1", "evt_1"]);
  });
  it("treats an unpaid completed checkout (bank debit) as processing", () => {
    expect(normalizeStripeEvent({ id: "e", type: "checkout.session.completed", data: { object: { payment_status: "unpaid", client_reference_id: "p2" } } })!.type).toBe("payment_processing");
  });
  it("reads cumulative refunds and ignores events we do not use", () => {
    expect(normalizeStripeEvent({ id: "e", type: "charge.refunded", data: { object: { payment_intent: "pi_1", amount_refunded: 2500 } } })!.amountCents).toBe(2500);
    expect(normalizeStripeEvent({ id: "e", type: "customer.created", data: { object: {} } })).toBeNull();
  });
});
