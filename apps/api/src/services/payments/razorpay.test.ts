import { beforeAll, describe, expect, it, vi } from "vitest";

let encryptRazorpaySecret: (value: string) => string;
let decryptRazorpaySecret: (value: string) => string;
let createRazorpayTestPaymentLink: (input: any) => Promise<{ id: string; url: string }>;
let verifyRazorpayWebhook: (raw: Buffer, signature: string | undefined, secret: string) => boolean;
let normalizeRazorpayEvent: (body: any, eventId: string) => any;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/unused";
  process.env.JWT_ACCESS_SECRET = "unit-test-jwt-secret-with-at-least-32-characters";
  process.env.RAZORPAY_CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
  process.env.RAZORPAY_API_ENABLED = "true";
  ({ encryptRazorpaySecret, decryptRazorpaySecret, createRazorpayTestPaymentLink, verifyRazorpayWebhook, normalizeRazorpayEvent } = await import("./razorpay"));
});

describe("Razorpay Test Mode helpers", () => {
  it("encrypts secrets with authenticated encryption and rejects tampering", () => {
    const encrypted = encryptRazorpaySecret("private merchant secret");
    expect(encrypted).not.toContain("private merchant secret");
    expect(decryptRazorpaySecret(encrypted)).toBe("private merchant secret");
    const fields = encrypted.split(".");
    fields[3] = `${fields[3]}x`;
    expect(() => decryptRazorpaySecret(fields.join("."))).toThrow();
  });

  it("creates a standard INR Payment Link using paise and disables provider notifications", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "plink_test_123", short_url: "https://rzp.io/i/example" }), { status: 200 }));
    const result = await createRazorpayTestPaymentLink({ keyId: "rzp_test_public", keySecret: "private", amountPaise: 12500, referenceId: "roofora-payment-123", description: "Roof work", customerName: "Test Customer", companyId: "company1", jobId: "job1", paymentId: "payment1" });
    expect(result).toEqual({ id: "plink_test_123", url: "https://rzp.io/i/example" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.razorpay.com/v1/payment_links");
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("rzp_test_public:private").toString("base64")}`);
    expect(JSON.parse(String(init?.body))).toMatchObject({ amount: 12500, currency: "INR", accept_partial: false, notify: { sms: false, email: false } });
    fetchMock.mockRestore();
  });

  it("verifies webhook HMAC over the exact raw request bytes", async () => {
    const body = Buffer.from('{"event":"payment_link.paid"}');
    const sig = (await import("node:crypto")).createHmac("sha256", "hook-secret").update(body).digest("hex");
    expect(verifyRazorpayWebhook(body, sig, "hook-secret")).toBe(true);
    expect(verifyRazorpayWebhook(Buffer.from(`${body.toString()} `), sig, "hook-secret")).toBe(false);
    expect(verifyRazorpayWebhook(body, undefined, "hook-secret")).toBe(false);
  });

  it("normalizes the requested webhook events and ignores unrelated ones", () => {
    expect(normalizeRazorpayEvent({ event: "payment_link.paid", payload: { payment_link: { entity: { id: "plink_1", reference_id: "payment1", amount_paid: 50000, currency: "INR" } } } }, "evt_1")).toMatchObject({ type: "payment_succeeded", linkId: "plink_1", internalPaymentId: "payment1", amountPaise: 50000 });
    expect(normalizeRazorpayEvent({ event: "payment.failed", payload: { payment: { entity: { id: "pay_1", error_description: "declined" } } } }, "evt_2")).toMatchObject({ type: "payment_failed", failureReason: "declined" });
    expect(normalizeRazorpayEvent({ event: "refund.processed", payload: { refund: { entity: { payment_id: "pay_1", amount: 2000, currency: "INR" } } } }, "evt_3")).toMatchObject({ type: "refund_total", providerPaymentId: "pay_1", refundAmountPaise: 2000 });
    expect(normalizeRazorpayEvent({ event: "payment.captured", payload: { payment: { entity: { id: "pay_2", amount: 50000, currency: "INR", payment_link_id: "plink_1" } } } }, "evt_4")).toMatchObject({ type: "payment_succeeded", providerPaymentId: "pay_2", amountPaise: 50000 });
    expect(normalizeRazorpayEvent({ event: "payment.authorized" }, "evt_5")).toBeNull();
  });
});
