import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addUser, createJob, createMilestone, lastSegment, registerCompany, startTestApp, type Session, type TestApp } from "./helpers";

let app: TestApp;
let s: Session;
let job: string;
let m1: string;
let signUrl = "";
let waiverId = "";

const bulk = (milestoneId: string) => app.call("POST", `/jobs/${job}/waivers/bulk`, { token: s.token, body: { milestoneId, throughDate: "2026-10-01" } });
const readiness = async (id: string) => (await app.call("GET", `/jobs/${job}/milestones`, { token: s.token })).body.items.find((m: any) => m.id === id);

beforeAll(async () => {
  app = await startTestApp();
  s = await registerCompany(app);
  job = await createJob(app, s);
  await app.call("POST", `/jobs/${job}/parties`, { token: s.token, body: { type: "supplier", name: "Shingle Supply Co", contractAmountCents: 100000 } });
  m1 = await createMilestone(app, s, job, { label: "Draw 1" });
});
afterAll(() => app.close());

describe("waiver forms", () => {
  it("cannot be used until someone approves them", async () => {
    const r = await bulk(m1);
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("template_not_approved");
  });
  it("can only be approved by an owner or admin", async () => {
    expect((await app.call("GET", "/waiver-templates", { token: s.token })).body.items).toHaveLength(4);
    const pm = await addUser(app, s.companyId, "pm");
    expect((await app.call("POST", "/waiver-templates/conditional_progress/approve", { token: pm.token })).status).toBe(403);
    const ok = await app.call("POST", "/waiver-templates/conditional_progress/approve", { token: s.token });
    expect(ok.status).toBe(200);
    expect(ok.body.legalApproved).toBe(true);
  });
  it("editing a form makes a new version that needs approval again", async () => {
    const edited = await app.call("PUT", "/waiver-templates/unconditional_progress", { token: s.token, body: { body: "Changed wording ".repeat(10) } });
    expect(edited.body.version).toBe(2);
    expect(edited.body.legalApproved).toBe(false);
  });
});

describe("requesting and signing", () => {
  it("creates one request per party that owes one, and does not duplicate open ones", async () => {
    const r = await bulk(m1);
    expect(r.status).toBe(201);
    expect(r.body.created).toHaveLength(1);
    expect(r.body.created[0].waiver.amountCents).toBe(100000);
    signUrl = r.body.created[0].signUrl;
    waiverId = r.body.created[0].waiver.id;
    const again = await bulk(m1);
    expect(again.body.created).toHaveLength(0);
    expect(again.body.skipped[0].reason).toMatch(/already open/i);
  });
  it("shows the signer the frozen wording and records that it was viewed", async () => {
    const r = await app.call("GET", `/public/waivers/${lastSegment(signUrl)}`);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("viewed");
    expect(r.body.text).toContain("Shingle Supply Co");
    expect(r.body.text).toContain("$1,000.00");
  });
  it("accepts one signature, and a second attempt is refused", async () => {
    const token = lastSegment(signUrl);
    const needsConsent = await app.call("POST", `/public/waivers/${token}/sign`, { body: { signerName: "Sam Supplier", consent: false } });
    expect(needsConsent.status).toBe(422);
    const signed = await app.call("POST", `/public/waivers/${token}/sign`, { body: { signerName: "shingle supply co", consent: true } });
    expect(signed.status).toBe(200);
    expect(signed.body.documentHash).toHaveLength(64);
    expect((await app.call("POST", `/public/waivers/${token}/sign`, { body: { signerName: "Someone Else", consent: true } })).status).toBe(409);
  });
  it("passes its integrity check, and the payment becomes ready without an override", async () => {
    const d = await app.call("GET", `/jobs/${job}/waivers/${waiverId}`, { token: s.token });
    expect(d.body.integrity).toBe("valid");
    expect((await readiness(m1)).readiness.ready).toBe(true);
    const ready = await app.call("POST", `/jobs/${job}/milestones/${m1}/mark-ready`, { token: s.token, body: {} });
    expect(ready.status).toBe(200);
    expect(ready.body.status).toBe("ready");
  });
});

describe("a signed waiver is evidence", () => {
  it("cannot be changed through the application", async () => {
    const w = await app.models.Waiver.findOne({ _id: waiverId }).setOptions({ skipTenant: true });
    w!.amountCents = 1;
    await expect(w!.save()).rejects.toThrow(/immutable/);
  });
  it("shows as tampered if someone edits the database directly", async () => {
    await app.models.Waiver.collection.updateOne({ _id: new app.mongoose.Types.ObjectId(waiverId) }, { $set: { renderedText: "quietly changed" } });
    const d = await app.call("GET", `/jobs/${job}/waivers/${waiverId}`, { token: s.token });
    expect(d.body.integrity).toBe("tampered");
  });
});

describe("declined, expired and gated", () => {
  let m2: string;
  let urls: { party: string; signUrl: string; waiver: any }[] = [];

  it("sets up a second payment with two parties owing", async () => {
    await app.call("POST", `/jobs/${job}/parties`, { token: s.token, body: { type: "subcontractor", name: "Ridgeline Crews", contractAmountCents: 50000 } });
    m2 = await createMilestone(app, s, job, { label: "Draw 2" });
    const r = await bulk(m2);
    urls = r.body.created;
    expect(urls).toHaveLength(2);
    expect(urls.reduce((n, u) => n + u.waiver.amountCents, 0)).toBeGreaterThanOrEqual(99999); // shares add up to the payment
  });
  it("records a decline and keeps the payment not ready", async () => {
    const crew = urls.find((u) => u.party === "Ridgeline Crews")!;
    const r = await app.call("POST", `/public/waivers/${lastSegment(crew.signUrl)}/decline`, { body: { reason: "Not our work" } });
    expect(r.status).toBe(200);
    expect((await readiness(m2)).readiness.missing).toHaveLength(2);
  });
  it("refuses an expired link", async () => {
    const sup = urls.find((u) => u.party === "Shingle Supply Co")!;
    await app.models.Waiver.collection.updateOne({ _id: new app.mongoose.Types.ObjectId(sup.waiver.id) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await app.call("GET", `/public/waivers/${lastSegment(sup.signUrl)}`)).body.status).toBe("expired");
    expect((await app.call("POST", `/public/waivers/${lastSegment(sup.signUrl)}/sign`, { body: { signerName: "Shingle Supply Co", consent: true } })).status).toBe(410);
  });
  it("warns about missing waivers and needs an explicit override", async () => {
    const first = await app.call("POST", `/jobs/${job}/milestones/${m2}/mark-ready`, { token: s.token, body: {} });
    expect(first.status).toBe(409);
    expect(first.body.error.code).toBe("waivers_missing_confirm");
    const forced = await app.call("POST", `/jobs/${job}/milestones/${m2}/mark-ready`, { token: s.token, body: { overrideMissing: true, reason: "Owner approved" } });
    expect(forced.status).toBe(200);
    expect(forced.body.overrideNote).toMatch(/missing/i);
  });
  it("blocks outright when the company setting is block", async () => {
    await app.models.Company.updateOne({ _id: s.companyId }, { $set: { "settings.paymentGating": "block" } });
    const m3 = await createMilestone(app, s, job, { label: "Draw 3" });
    const r = await app.call("POST", `/jobs/${job}/milestones/${m3}/mark-ready`, { token: s.token, body: { overrideMissing: true } });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("waivers_missing");
  });
});
