import type { PaymentProvider } from "./types";

/** Development gateway. "Checkout" is a page in our own web app that simulates the outcome. No real money moves. */
export const createMockProvider = (webOrigin: string): PaymentProvider => ({
  name: "mock",
  async createCheckout(i) {
    const sessionId = `mock_cs_${i.paymentId}_${Date.now().toString(36)}`;
    const token = new URL(i.successUrl).pathname.split("/").filter(Boolean)[1]; // /pay/<token>
    return { sessionId, url: `${webOrigin}/pay/${token}/mock?session=${sessionId}`, paymentIntentId: `mock_pi_${i.paymentId}` };
  },
  async refund({ idempotencyKey }) {
    return { refundId: `mock_re_${idempotencyKey.slice(-12)}` };
  },
});
