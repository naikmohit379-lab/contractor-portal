import { env } from "../../../config/env";
import { createMockProvider } from "./mock";
import { createStripeProvider } from "./stripe";
import type { PaymentProvider } from "./types";

export function getPaymentProvider(): PaymentProvider {
  if (env.PAYMENT_PROVIDER === "stripe") {
    if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is required when PAYMENT_PROVIDER=stripe");
    return createStripeProvider(env.STRIPE_SECRET_KEY);
  }
  return createMockProvider(env.WEB_ORIGIN);
}
