import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PASSWORD, addUser, createJob, createMilestone, lastSegment, registerCompany, startTestApp, stripeEvent, type Session, type TestApp } from "./helpers";

let app: TestApp;
let s: Session;
let admin: Session;

beforeAll(async () => {
  app = await startTestApp();
  s = await registerCompany(app);
  admin = await addUser(app, s.companyId, "admin");
});
afterAll(() => app.close());

const readyMilestone = async (job: string, amount = 100000) => {
  const m = await createMilestone(app, s, job, { type: "final", amount, requireWaivers: false, label: "Final" });
  await app.call("POST", `/jobs/${job}/milestones/${m}/mark-ready`, { token: s.token, body: {} });
  return m;
};
const request = (job: string, milestoneId: string, amountCents?: number) =>
  app.call("POST", `/jobs/${job}/payments`, { token: s.token, body: { milestoneId, payerName: "Pat Payer", amountCents } });
const ledgerOf = (paymentId: string) => app.models.LedgerEntry.collection.find({ paymentId: new app.mongoose.Types.ObjectId(paymentId) }).toArray();
const paymentsOf = async (job: string) => (await app.call("GET", `/jobs/${job}/payments`, { token: s.token })).body;
const post = (path: string, body: unknown, who = s) => app.call("POST", path, { token: who.token, body });

let job1: string, m1: string, p1: string, payToken1: string;

describe("billing and paying", () => {
  it("only bills a payment that was marked ready, and never more than is owed", async () => {
    job1 = await createJob(app, s);
    const pending = await createMilestone(app, s, job1, { type: "final", requireWaivers: false });
    const early = await request(job1, pending);
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("not_ready");

    m1 = await readyMilestone(job1);
    expect((await request(job1, m1, 100001)).body.error.code).toBe("too_much");
    const ok = await request(job1, m1);
    expect(ok.status).toBe(201);
    expect(ok.body.payment.amountCents).toBe(100000);
    p1 = ok.body.payment.id;
    payToken1 = lastSegment(ok.body.payUrl);
    expect((await request(job1, m1)).body.error.code).toBe("nothing_owed"); // the whole amount is already requested
  });
  it("lets the payer retry after a failed attempt", async () => {
    expect((await app.call("GET", `/public/payments/${payToken1}`)).body.status).toBe("requested");
    const co = await app.call("POST", `/public/payments/${payToken1}/checkout`);
    expect(co.status).toBe(200);
    expect(co.body.url).toContain("/mock");
    await app.call("POST", `/public/payments/${payToken1}/mock-result`, { body: { outcome: "failure" } });
    expect((await paymentsOf(job1)).payments[0].status).toBe("failed");
    expect((await app.call("POST", `/public/payments/${payToken1}/checkout`)).status).toBe(200);
    await app.call("POST", `/public/payments/${payToken1}/mock-result`, { body: { outcome: "success" } });
    expect((await paymentsOf(job1)).payments[0].status).toBe("succeeded");
  });
  it("posts a balanced ledger, marks the payment paid and closes the job", async () => {
    const lines = await ledgerOf(p1);
    expect(lines).toHaveLength(2);
    const cash = lines.find((l) => l.account === "cash")!;
    const recv = lines.find((l) => l.account === "receivable")!;
    expect([cash.direction, recv.direction]).toEqual(["debit", "credit"]);
    expect([cash.amountCents, recv.amountCents]).toEqual([100000, 100000]);
    expect((await app.call("GET", `/jobs/${job1}/milestones`, { token: s.token })).body.items.find((m: any) => m.id === m1).status).toBe("paid");
    expect((await app.call("GET", `/jobs/${job1}`, { token: s.token })).body.stage).toBe("paid");
    expect((await paymentsOf(job1)).collectedCents).toBe(100000);
  });
  it("does not post twice if the same success arrives again", async () => {
    await app.call("POST", `/public/payments/${payToken1}/mock-result`, { body: { outcome: "success" } });
    expect(await ledgerOf(p1)).toHaveLength(2);
  });
});

describe("gateway webhooks", () => {
  const send = (body: string, signature: string) =>
    app.call("POST", `${app.origin}/api/v1/webhooks/stripe`, { raw: Buffer.from(body), headers: { "Content-Type": "application/json", "Stripe-Signature": signature } });
  let job2: string, p2: string;

  it("applies a signed event once and ignores its redelivery", async () => {
    job2 = await createJob(app, s);
    p2 = (await request(job2, await readyMilestone(job2))).body.payment.id;
    const evt = stripeEvent("evt_paid_1", "checkout.session.completed", { payment_status: "paid", amount_total: 100000, currency: "usd", payment_intent: "pi_1", metadata: { paymentId: p2 } });
    const first = await send(evt.body, evt.signature);
    expect(first.status).toBe(200);
    expect(first.body.outcome).toBe("applied");
    expect(await ledgerOf(p2)).toHaveLength(2);
    expect((await send(evt.body, evt.signature)).body.outcome).toBe("duplicate");
    expect(await ledgerOf(p2)).toHaveLength(2);
  });
  it("rejects a bad or stale signature", async () => {
    const evt = stripeEvent("evt_bad_1", "checkout.session.completed", { metadata: { paymentId: p2 } });
    const bad = await send(evt.body, evt.signature.replace(/v1=./, "v1=0"));
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("bad_signature");
    expect((await send(evt.body, "t=1,v1=abc")).status).toBe(400);
  });
  it("flags a payment whose amount does not match and posts nothing", async () => {
    const job3 = await createJob(app, s);
    const p3 = (await request(job3, await readyMilestone(job3))).body.payment.id;
    const evt = stripeEvent("evt_mismatch_1", "checkout.session.completed", { payment_status: "paid", amount_total: 50000, currency: "usd", metadata: { paymentId: p3 } });
    await send(evt.body, evt.signature);
    const p = (await paymentsOf(job3)).payments[0];
    expect(p.status).toBe("requested");
    expect(p.flag).toBe("amount_mismatch");
    expect(await ledgerOf(p3)).toHaveLength(0);
    const rec = await app.call("GET", "/payments/reconciliation", { token: s.token });
    expect(rec.body.exceptions.some((e: any) => e.paymentId === p3)).toBe(true);
    expect(rec.body.exceptions.some((e: any) => e.paymentId === p1 || e.paymentId === p2)).toBe(false);
  });
});

describe("refunds", () => {
  it("needs the right permission, password and amount", async () => {
    const body = { amountCents: 5000, reason: "Customer goodwill", password: PASSWORD };
    expect((await post(`/jobs/${job1}/payments/${p1}/refunds`, body, admin)).status).toBe(403); // admins cannot start refunds
    expect((await post(`/jobs/${job1}/payments/${p1}/refunds`, { ...body, password: "wrong password" })).body.error.code).toBe("step_up_failed");
    expect((await post(`/jobs/${job1}/payments/${p1}/refunds`, { ...body, amountCents: 100001 })).body.error.code).toBe("too_much");
  });
  it("refunds a small amount straight away, posts it, and reopens the payment", async () => {
    const r = await post(`/jobs/${job1}/payments/${p1}/refunds`, { amountCents: 5000, reason: "Customer goodwill", password: PASSWORD });
    expect(r.status).toBe(201);
    expect(r.body.needsApproval).toBe(false);
    expect((await paymentsOf(job1)).payments[0].status).toBe("partially_refunded");
    expect(await ledgerOf(p1)).toHaveLength(4);
    // 95,000 kept is less than the 100,000 expected, so the milestone is no longer paid
    expect((await app.call("GET", `/jobs/${job1}/milestones`, { token: s.token })).body.items.find((m: any) => m.id === m1).status).toBe("ready");
  });
  it("makes a refund above the limit wait for a different person", async () => {
    await app.models.Company.updateOne({ _id: s.companyId }, { $set: { "settings.refundApprovalThresholdCents": 1000 } });
    const r = await post(`/jobs/${job1}/payments/${p1}/refunds`, { amountCents: 5000, reason: "Second refund", password: PASSWORD });
    expect(r.status).toBe(202);
    expect(r.body.needsApproval).toBe(true);
    const id = r.body.refund.id;
    const own = await post(`/jobs/${job1}/payments/refunds/${id}/approve`, { password: PASSWORD });
    expect(own.status).toBe(403);
    expect(own.body.error.code).toBe("same_person");
    expect((await post(`/jobs/${job1}/payments/refunds/${id}/approve`, { password: "nope nope nope" }, admin)).body.error.code).toBe("step_up_failed");
    const ok = await post(`/jobs/${job1}/payments/refunds/${id}/approve`, { password: PASSWORD }, admin);
    expect(ok.status).toBe(200);
    expect(ok.body.refund.status).toBe("processed");
    expect((await paymentsOf(job1)).payments[0].refundedCents).toBe(10000);
    expect(await ledgerOf(p1)).toHaveLength(6);
  });
});

describe("ledger", () => {
  it("is append-only", async () => {
    await expect(app.models.LedgerEntry.updateOne({}, { amountCents: 1 }).setOptions({ skipTenant: true })).rejects.toThrow(/append-only/);
    const entry = await app.models.LedgerEntry.findOne().setOptions({ skipTenant: true });
    entry!.amountCents = 1;
    await expect(entry!.save()).rejects.toThrow(/append-only/);
  });
  it("reconciles cleanly for every payment that went through the normal path", async () => {
    const rec = await app.call("GET", "/payments/reconciliation", { token: s.token });
    expect(rec.body.exceptions.filter((e: any) => e.paymentId === p1)).toEqual([]);
  });
});
