export type NormalizedEventType = "payment_succeeded" | "payment_processing" | "payment_failed" | "refund_total" | "dispute_opened";

/** The gateway-neutral shape every provider event is converted to before the app acts on it. */
export interface NormalizedEvent {
  eventId: string;
  provider: string;
  type: NormalizedEventType;
  paymentId?: string; // our id, carried in gateway metadata
  paymentIntentId?: string;
  amountCents?: number; // paid amount, or the cumulative refunded amount for refund_total
  currency?: string;
  failureReason?: string;
}

export interface CheckoutInput {
  paymentId: string;
  amountCents: number;
  currency: string;
  description: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
}

/**
 * Every gateway is wrapped in this interface. Payers always pay on the gateway's hosted page,
 * so card and bank details never reach our servers (PCI DSS SAQ A).
 */
export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: CheckoutInput): Promise<{ sessionId: string; url: string; paymentIntentId?: string }>;
  refund(input: { paymentIntentId?: string; amountCents: number; idempotencyKey: string }): Promise<{ refundId: string }>;
}
