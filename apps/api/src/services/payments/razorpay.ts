import crypto from "node:crypto";
import { env } from "../../config/env";

const keyBytes = () => {
  if (!env.RAZORPAY_CREDENTIALS_ENCRYPTION_KEY) throw new Error("Razorpay credential encryption is not configured");
  return Buffer.from(env.RAZORPAY_CREDENTIALS_ENCRYPTION_KEY, "base64");
};

/** AES-256-GCM envelope: version, nonce, auth tag and ciphertext; plaintext secrets never enter MongoDB. */
export function encryptRazorpaySecret(value: string) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBytes(), nonce);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1.${nonce.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptRazorpaySecret(envelope: string) {
  const [version, nonceText, tagText, ciphertextText] = envelope.split(".");
  if (version !== "v1" || !nonceText || !tagText || !ciphertextText) throw new Error("Invalid encrypted Razorpay credential");
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBytes(), Buffer.from(nonceText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
}

export async function createRazorpayTestPaymentLink(input: {
  keyId: string; keySecret: string; amountPaise: number; referenceId: string; description: string;
  customerName: string; customerEmail?: string; companyId: string; jobId: string; paymentId: string;
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${Buffer.from(`${input.keyId}:${input.keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
        "User-Agent": "Roofora/1.0 Test Payments",
      },
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: "INR",
        accept_partial: false,
        reference_id: input.referenceId,
        description: input.description.slice(0, 255),
        customer: { name: input.customerName, ...(input.customerEmail ? { email: input.customerEmail } : {}) },
        notify: { sms: false, email: false },
        reminder_enable: false,
        notes: { rooforaCompanyId: input.companyId, rooforaJobId: input.jobId, rooforaPaymentId: input.paymentId },
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || typeof result?.id !== "string" || typeof result?.short_url !== "string") {
      // Never propagate provider response text: it may include account data.
      throw new Error(`Razorpay Test API rejected the payment link request (HTTP ${response.status})`);
    }
    return { id: result.id as string, url: result.short_url as string };
  } finally {
    clearTimeout(timer);
  }
}

export function verifyRazorpayWebhook(raw: Buffer, signature: string | undefined, secret: string) {
  if (!signature || !/^[a-f\d]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

export function normalizeRazorpayEvent(body: any, eventId: string) {
  const type = body?.event;
  const payload = body?.payload ?? {};
  const link = payload?.payment_link?.entity;
  const payment = payload?.payment?.entity;
  const refund = payload?.refund?.entity;
  const internalPaymentId = link?.reference_id ?? link?.notes?.rooforaPaymentId ?? payment?.notes?.rooforaPaymentId ?? refund?.notes?.rooforaPaymentId;
  const linkId = link?.id ?? payment?.payment_link_id ?? payment?.invoice_id ?? refund?.payment_link_id;
  const normalized = { eventId, provider: "razorpay-test", internalPaymentId: String(internalPaymentId ?? ""), linkId: String(linkId ?? "") };
  switch (type) {
    case "payment_link.paid":
      return { ...normalized, type: "payment_succeeded" as const, providerPaymentId: String(link?.payment_id ?? link?.payments?.[0]?.payment_id ?? payment?.id ?? ""), amountPaise: Number(link?.amount_paid ?? link?.amount), currency: String(link?.currency ?? "INR") };
    case "payment.captured":
      return { ...normalized, type: "payment_succeeded" as const, providerPaymentId: String(payment?.id ?? ""), amountPaise: Number(payment?.amount), currency: String(payment?.currency ?? "INR") };
    case "payment.failed":
      return { ...normalized, type: "payment_failed" as const, providerPaymentId: String(payment?.id ?? ""), failureReason: String(payment?.error_description ?? "The payment failed").slice(0, 300) };
    case "refund.processed":
      return { ...normalized, type: "refund_total" as const, providerPaymentId: String(refund?.payment_id ?? ""), refundAmountPaise: Number(refund?.amount), currency: String(refund?.currency ?? "INR") };
    default:
      return null;
  }
}
