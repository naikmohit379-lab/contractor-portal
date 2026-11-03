import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PASSWORD, addUser, createJob, createMilestone, lastSegment, registerCompany, startTestApp, type Session, type TestApp } from "./helpers";

let app: TestApp;
let owner: Session;
let pm: Session;
let jobId: string;
let milestoneId: string;
let paymentId: string;
let payToken: string;

beforeAll(async () => {
  app = await startTestApp({ razorpayLinksEnabled: true });
  owner = await registerCompany(app, "Razorpay Link Test Contractor");
  pm = await addUser(app, owner.companyId, "pm");
  jobId = await createJob(app, owner);
  milestoneId = await createMilestone(app, owner, jobId, { type: "final", amount: 100000, requireWaivers: false, label: "Final payment" });
  await app.call("POST", `/jobs/${jobId}/milestones/${milestoneId}/mark-ready`, { token: owner.token, body: {} });
  const created = await app.call("POST", `/jobs/${jobId}/payments`, {
    token: owner.token,
    body: { milestoneId, payerName: "Test Customer", razorpayPaymentUrl: "https://rzp.io/i/test-link-1" },
  });
  if (created.status !== 201) throw new Error(`Payment request failed: ${created.status} ${JSON.stringify(created.body)}`);
  paymentId = created.body.payment.id;
  payToken = lastSegment(created.body.payUrl);
});

afterAll(() => app.close());

describe("contractor-owned Razorpay Payment Link MVP", () => {
  it("stores and exposes the link on the payer page with the company as payee", async () => {
    const payerPage = await app.call("GET", `/public/payments/${payToken}`);
    expect(payerPage.body.provider).toBe("razorpay-link");
    expect(payerPage.body.externalPaymentUrl).toBe("https://rzp.io/i/test-link-1");
    expect(payerPage.body.company).toBe("Razorpay Link Test Contractor");
  });

  it("does not allow mock checkout or a non-approver to record a payment", async () => {
    expect((await app.call("POST", `/public/payments/${payToken}/checkout`)).status).toBe(409);
    expect((await app.call("POST", `/public/payments/${payToken}/mock-result`, { body: { outcome: "success" } })).status).toBe(404);
    const result = await app.call("POST", `/jobs/${jobId}/payments/${paymentId}/record-razorpay-payment`, {
      token: pm.token,
      body: { razorpayPaymentId: "pay_123456", amountCents: 100000, currency: "INR", password: PASSWORD, confirmedCaptured: true },
    });
    expect(result.status).toBe(403);
  });

  it("flags amount mismatches without posting ledger entries, then records a verified match", async () => {
    const path = `/jobs/${jobId}/payments/${paymentId}/record-razorpay-payment`;
    const mismatch = await app.call("POST", path, { token: owner.token, body: { razorpayPaymentId: "pay_123456", amountCents: 99999, currency: "INR", password: PASSWORD, confirmedCaptured: true } });
    expect(mismatch.status).toBe(422);
    expect((await app.call("GET", `/jobs/${jobId}/payments`, { token: owner.token })).body.payments[0].flag).toBe("amount_mismatch");
    expect(await app.models.LedgerEntry.collection.countDocuments({ paymentId: new app.mongoose.Types.ObjectId(paymentId) })).toBe(0);

    const recorded = await app.call("POST", path, { token: owner.token, body: { razorpayPaymentId: "pay_123456", amountCents: 100000, currency: "inr", password: PASSWORD, confirmedCaptured: true } });
    expect(recorded.status).toBe(200);
    expect(recorded.body.payment.status).toBe("succeeded");
    expect(recorded.body.payment.providerReference).toBe("pay_123456");
    expect(recorded.body.payment.flag).toBeUndefined();
    expect(await app.models.LedgerEntry.collection.countDocuments({ paymentId: new app.mongoose.Types.ObjectId(paymentId) })).toBe(2);
  });

  it("prevents the same Razorpay Payment ID from being attached to a second Roofora payment", async () => {
    const secondMilestone = await createMilestone(app, owner, jobId, { type: "progress", amount: 50000, requireWaivers: false, label: "Second payment" });
    await app.call("POST", `/jobs/${jobId}/milestones/${secondMilestone}/mark-ready`, { token: owner.token, body: {} });
    const second = await app.call("POST", `/jobs/${jobId}/payments`, { token: owner.token, body: { milestoneId: secondMilestone, payerName: "Test Customer", razorpayPaymentUrl: "https://rzp.io/i/test-link-2" } });
    const replay = await app.call("POST", `/jobs/${jobId}/payments/${second.body.payment.id}/record-razorpay-payment`, {
      token: owner.token,
      body: { razorpayPaymentId: "pay_123456", amountCents: 50000, currency: "INR", password: PASSWORD, confirmedCaptured: true },
    });
    expect(replay.status).toBe(409);
    expect(replay.body.error.code).toBe("razorpay_payment_reused");
  });
});
