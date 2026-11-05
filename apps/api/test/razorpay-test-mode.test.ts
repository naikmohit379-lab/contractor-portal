import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createJob, createMilestone, registerCompany, startTestApp, type Session, type TestApp } from "./helpers";

let app: TestApp;
let owner: Session;
let jobId: string;
let paymentId: string;
let linkId = "plink_test_roofora_1";
let originalFetch: typeof fetch;

const apiKeyId = "rzp_test_Roofora123";
const apiKeySecret = "test_key_secret_only_for_fixture";
const hookSecret = "test_webhook_secret_only_for_fixture";

beforeAll(async () => {
  app = await startTestApp({ razorpayApiEnabled: true });
  owner = await registerCompany(app, "Razorpay Test API Contractor");
  jobId = await createJob(app, owner);
  const milestone = await createMilestone(app, owner, jobId, { type: "final", amount: 100000, requireWaivers: false, label: "Final payment" });
  await app.call("POST", `/jobs/${jobId}/milestones/${milestone}/mark-ready`, { token: owner.token, body: {} });

  originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith("https://api.razorpay.com/")) {
      const request = JSON.parse(String(init?.body));
      expect(request.currency).toBe("INR");
      expect(request.amount).toBe(100000);
      expect(request.accept_partial).toBe(false);
      expect(request.notes.rooforaPaymentId).toBeTruthy();
      return new Response(JSON.stringify({ id: linkId, short_url: "https://rzp.io/i/testgenerated" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  const saved = await app.call("PUT", "/admin/razorpay-test", { token: owner.token, body: { keyId: apiKeyId, keySecret: apiKeySecret, webhookSecret: hookSecret } });
  if (saved.status !== 200) throw new Error(`Save Razorpay Test credentials failed: ${saved.status} ${JSON.stringify(saved.body)}`);
  const created = await app.call("POST", `/jobs/${jobId}/payments`, { token: owner.token, body: { milestoneId: milestone, payerName: "Test Customer" } });
  if (created.status !== 201) throw new Error(`Create Razorpay Test link failed: ${created.status} ${JSON.stringify(created.body)}`);
  paymentId = created.body.payment.id;
});

afterAll(async () => {
  if (originalFetch) globalThis.fetch = originalFetch;
  if (app) await app.close();
});

function sendWebhook(eventId: string, payload: unknown, session = owner) {
  const raw = Buffer.from(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", hookSecret).update(raw).digest("hex");
  return app.call("POST", `${app.origin}/api/v1/webhooks/razorpay/${session.companyId}`, { raw, headers: { "Content-Type": "application/json", "X-Razorpay-Signature": signature, "X-Razorpay-Event-Id": eventId } });
}

describe("Razorpay Test Mode company connections and webhooks", () => {
  it("stores credentials encrypted and only returns connection status", async () => {
    const saved = await app.models.Company.collection.findOne({ _id: new app.mongoose.Types.ObjectId(owner.companyId) });
    const connection = saved?.settings?.razorpayTest;
    expect(connection.keyId).toBe(apiKeyId);
    expect(connection.encryptedKeySecret).not.toBe(apiKeySecret);
    expect(connection.encryptedWebhookSecret).not.toBe(hookSecret);
    const result = await app.call("GET", "/admin/razorpay-test", { token: owner.token });
    expect(result.body).toMatchObject({ enabled: true, configured: true, webhookUrl: `https://api.test.roofora.example/api/v1/webhooks/razorpay/${owner.companyId}` });
    expect(JSON.stringify(result.body)).not.toContain(apiKeySecret);
    expect(JSON.stringify(result.body)).not.toContain(hookSecret);
    const paymentOptions = await app.call("GET", `/jobs/${jobId}/payments`, { token: owner.token });
    expect(paymentOptions.body.paymentOptions).toMatchObject({ razorpayApiEnabled: true, razorpayApiConfigured: true, companyCountry: "IN", currency: "INR" });
  });

  it("creates the company-owned Test Mode link and confirms only a valid signed webhook", async () => {
    const payment = await app.models.Payment.findById(paymentId).setOptions({ skipTenant: true });
    expect(payment?.provider).toBe("razorpay-test");
    expect(payment?.providerSessionId).toBe(linkId);
    expect(payment?.externalPaymentUrl).toBe("https://rzp.io/i/testgenerated");
    const body = { entity: "event", event: "payment_link.paid", payload: { payment_link: { entity: { id: linkId, reference_id: paymentId, status: "paid", amount: 100000, amount_paid: 100000, currency: "INR" } } } };
    const first = await sendWebhook("evt_roofora_paid_1", body);
    expect(first.status).toBe(200);
    expect(first.body.outcome).toBe("applied");
    expect((await app.models.Payment.findById(paymentId).setOptions({ skipTenant: true }))?.status).toBe("succeeded");
    expect(await app.models.LedgerEntry.collection.countDocuments({ paymentId: new app.mongoose.Types.ObjectId(paymentId) })).toBe(2);
    expect((await sendWebhook("evt_roofora_paid_1", body)).body.outcome).toBe("duplicate");
    expect(await app.models.LedgerEntry.collection.countDocuments({ paymentId: new app.mongoose.Types.ObjectId(paymentId) })).toBe(2);
  });

  it("rejects invalid signatures and keeps company boundaries on the webhook URL", async () => {
    const body = Buffer.from(JSON.stringify({ entity: "event", event: "payment_link.paid", payload: {} }));
    expect((await app.call("POST", `${app.origin}/api/v1/webhooks/razorpay/${owner.companyId}`, { raw: body, headers: { "Content-Type": "application/json", "X-Razorpay-Signature": "0".repeat(64), "X-Razorpay-Event-Id": "evt_bad" } })).status).toBe(400);
    const other = await registerCompany(app, "Different Test Company");
    const wrongTenant = await sendWebhook("evt_wrong_company", { entity: "event", event: "payment_link.paid", payload: {} }, other);
    expect(wrongTenant.status).toBe(404);
  });

  it("does not let a non-owner/non-admin change the company connection", async () => {
    const member = await (await import("./helpers")).addUser(app, owner.companyId, "pm");
    const denied = await app.call("PUT", "/admin/razorpay-test", { token: member.token, body: { keyId: apiKeyId, keySecret: apiKeySecret, webhookSecret: hookSecret } });
    expect(denied.status).toBe(403);
  });
});
