import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildEstimate, createJob, registerCompany, seedMeasurement, startTestApp, type Session, type TestApp } from "./helpers";

let app: TestApp;
let s: Session;
beforeAll(async () => { app = await startTestApp(); s = await registerCompany(app); });
afterAll(() => app.close());

const claimBody = { carrier: "Acme Mutual", policyNo: "P-1", claimNo: "C-1", dateOfLoss: "2026-09-01", deductibleCents: 100000 };

describe("estimates", () => {
  it("needs a delivered measurement report", async () => {
    const job = await createJob(app, s);
    const pending = await seedMeasurement(app, s.companyId, job, "processing");
    const r = await app.call("POST", `/jobs/${job}/estimate/generate`, { token: s.token, body: { measurementId: pending } });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("measurement_not_ready");
  });
  it("builds version 1 from the report and moves the job to Estimated", async () => {
    const job = await createJob(app, s);
    const r = await buildEstimate(app, s, job);
    expect(r.status).toBe(201);
    const v = r.body.estimate.versions[0];
    expect(v.kind).toBe("original");
    expect(v.lineItems.length).toBeGreaterThanOrEqual(8);
    expect(v.totals.rcvCents).toBeGreaterThan(0);
    expect((await app.call("GET", `/jobs/${job}`, { token: s.token })).body.stage).toBe("estimated");
    expect((await buildEstimate(app, s, job)).status).toBe(409); // one estimate per job
  });
  it("uses the company's price list, as a new version, for new estimates", async () => {
    const before = await app.call("GET", "/price-lists/active", { token: s.token });
    const items = before.body.items.map((i: any) => (i.key === "shingles" ? { ...i, unitPriceCents: 99900 } : i));
    const saved = await app.call("PUT", "/price-lists/active", { token: s.token, body: { items } });
    expect(saved.status).toBe(200);
    expect(saved.body.version).toBe(before.body.version + 1);
    const job = await createJob(app, s);
    const est = await buildEstimate(app, s, job);
    expect(est.body.estimate.versions[0].lineItems.find((i: any) => i.key === "shingles").unitPriceCents).toBe(99900);
    expect(est.body.estimate.versions[0].note).toMatch(/price list version/);
    const dup = await app.call("PUT", "/price-lists/active", { token: s.token, body: { items: [items[0], items[0]] } });
    expect(dup.status).toBe(422);
  });
});

describe("claim workflow", () => {
  it("enforces the status machine, locks the submitted estimate, and requires a supplement version", async () => {
    const job = await createJob(app, s);
    const est = await buildEstimate(app, s, job);
    const v1 = est.body.estimate.versions[0];
    expect((await app.call("POST", `/jobs/${job}/claim`, { token: s.token, body: claimBody })).status).toBe(201);
    expect((await app.call("POST", `/jobs/${job}/claim`, { token: s.token, body: claimBody })).status).toBe(409); // one per job

    // draft -> approved is not allowed
    const bad = await app.call("POST", `/jobs/${job}/claim/status`, { token: s.token, body: { status: "approved" } });
    expect(bad.status).toBe(409);

    // submitting locks what the carrier saw
    expect((await app.call("POST", `/jobs/${job}/claim/status`, { token: s.token, body: { status: "submitted" } })).status).toBe(200);
    const locked = await app.call("PUT", `/jobs/${job}/estimate/versions/1`, { token: s.token, body: { lineItems: v1.lineItems, settings: v1.settings } });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe("version_locked");
    expect((await app.call("GET", `/jobs/${job}`, { token: s.token })).body.stage).toBe("claim_filed");

    // approval moves the job on and records the amount
    const ok = await app.call("POST", `/jobs/${job}/claim/status`, { token: s.token, body: { status: "approved", approvedAmountCents: 1200000 } });
    expect(ok.body.claim.approvedAmountCents).toBe(1200000);
    expect((await app.call("GET", `/jobs/${job}`, { token: s.token })).body.stage).toBe("approved");

    // a supplement cannot be filed until a supplement version exists
    const early = await app.call("POST", `/jobs/${job}/claim/status`, { token: s.token, body: { status: "supplement_filed" } });
    expect(early.status).toBe(422);
    expect(early.body.error.code).toBe("supplement_required");

    const sup = await app.call("POST", `/jobs/${job}/estimate/versions`, { token: s.token, body: { kind: "supplement" } });
    expect(sup.status).toBe(201);
    const v2 = sup.body.estimate.versions[1];
    const edited = v2.lineItems.map((i: any, n: number) => (n === 0 ? { ...i, quantity: i.quantity + 5 } : i));
    expect((await app.call("PUT", `/jobs/${job}/estimate/versions/2`, { token: s.token, body: { lineItems: edited, settings: v2.settings } })).status).toBe(200);
    expect((await app.call("POST", `/jobs/${job}/claim/status`, { token: s.token, body: { status: "supplement_filed" } })).status).toBe(200);

    const diff = await app.call("GET", `/jobs/${job}/estimate/diff?from=1&to=2`, { token: s.token });
    expect(diff.body.changed).toHaveLength(1);
    expect(diff.body.deltaSubtotalCents).toBeGreaterThan(0);
  });
  it("cannot submit without an estimate", async () => {
    const job = await createJob(app, s);
    await app.call("POST", `/jobs/${job}/claim`, { token: s.token, body: claimBody });
    const r = await app.call("POST", `/jobs/${job}/claim/status`, { token: s.token, body: { status: "submitted" } });
    expect(r.status).toBe(422);
  });
});
