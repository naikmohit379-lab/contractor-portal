import type { CheckoutInput, PaymentProvider } from "./types";

/**
 * Stripe over its REST API (no SDK). Uses hosted Checkout, so the payer enters card or bank details on
 * Stripe's page. NOT yet exercised against a live or test Stripe account: run it in test mode first.
 */
export function createStripeProvider(secretKey: string): PaymentProvider {
  async function call(path: string, params: URLSearchParams, idempotencyKey: string) {
    const res = await fetch(`https://api.stripe.com/v1${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": idempotencyKey },
      body: params,
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error?.message ?? `Stripe request failed (${res.status})`);
    return body;
  }

  return {
    name: "stripe",
    async createCheckout(i: CheckoutInput) {
      const p = new URLSearchParams();
      p.set("mode", "payment");
      p.set("success_url", i.successUrl);
      p.set("cancel_url", i.cancelUrl);
      p.set("client_reference_id", i.paymentId);
      p.set("metadata[paymentId]", i.paymentId);
      p.set("payment_intent_data[metadata][paymentId]", i.paymentId);
      p.append("payment_method_types[]", "card");
      p.append("payment_method_types[]", "us_bank_account"); // lower fees on large roofing invoices
      p.set("line_items[0][quantity]", "1");
      p.set("line_items[0][price_data][currency]", i.currency.toLowerCase());
      p.set("line_items[0][price_data][unit_amount]", String(i.amountCents));
      p.set("line_items[0][price_data][product_data][name]", i.description);
      if (i.customerEmail) p.set("customer_email", i.customerEmail);
      const s = await call("/checkout/sessions", p, i.idempotencyKey);
      return { sessionId: s.id, url: s.url, paymentIntentId: s.payment_intent ?? undefined };
    },
    async refund({ paymentIntentId, amountCents, idempotencyKey }) {
      if (!paymentIntentId) throw new Error("This payment has no gateway reference to refund against");
      const p = new URLSearchParams({ payment_intent: paymentIntentId, amount: String(amountCents) });
      const r = await call("/refunds", p, idempotencyKey);
      return { refundId: r.id };
    },
  };
}
