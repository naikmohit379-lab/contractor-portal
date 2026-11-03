import { describe, expect, it } from "vitest";
import { isRazorpayPaymentLink, paymentRequestSchema, recordExternalPaymentSchema } from "./payments";

describe("contractor-owned Razorpay Payment Link validation", () => {
  it("accepts HTTPS Razorpay short links and rejects non-Razorpay or unsafe URLs", () => {
    expect(isRazorpayPaymentLink("https://rzp.io/i/abc123")).toBe(true);
    expect(isRazorpayPaymentLink("http://rzp.io/i/abc123")).toBe(false);
    expect(isRazorpayPaymentLink("https://example.com/i/abc123")).toBe(false);
    expect(isRazorpayPaymentLink("https://rzp.io/redirect/abc123")).toBe(false);
    expect(isRazorpayPaymentLink("https://user:pass@rzp.io/i/abc123")).toBe(false);
  });

  it("limits pasted external URLs to a reasonable length", () => {
    expect(paymentRequestSchema.safeParse({ milestoneId: "m", payerName: "Customer", razorpayPaymentUrl: "https://rzp.io/i/abc123" }).success).toBe(true);
    expect(paymentRequestSchema.safeParse({ milestoneId: "m", payerName: "Customer", razorpayPaymentUrl: `https://rzp.io/i/${"x".repeat(2050)}` }).success).toBe(false);
  });

  it("requires a confirmed captured payment and normalizes currency", () => {
    const input = { razorpayPaymentId: "pay_1234", amountCents: 12500, currency: "inr", password: "pass", confirmedCaptured: true };
    expect(recordExternalPaymentSchema.parse(input).currency).toBe("INR");
    expect(recordExternalPaymentSchema.safeParse({ ...input, confirmedCaptured: false }).success).toBe(false);
    expect(recordExternalPaymentSchema.safeParse({ ...input, razorpayPaymentId: "bad id" }).success).toBe(false);
  });
});
