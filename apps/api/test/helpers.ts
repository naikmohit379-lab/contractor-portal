import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import argon2 from "argon2";
import { MongoMemoryReplSet } from "mongodb-memory-server";

export const STRIPE_SECRET = "whsec_integration_test";
export const PASSWORD = "correct horse battery staple";

export type Call = (method: string, path: string, o?: { token?: string; body?: unknown; headers?: Record<string, string>; raw?: Buffer; cookie?: string }) => Promise<{ status: number; body: any; headers: Headers }>;

/**
 * Starts the real API against a real MongoDB (an in-memory replica set, which supports the transactions
 * payments use). Environment is set BEFORE the app is imported, because the app reads it at import time.
 */
export async function startTestApp() {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = repl.getUri();
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "rd-test-files-"));
  Object.assign(process.env, {
    NODE_ENV: "test",
    MONGODB_URI: uri,
    JWT_ACCESS_SECRET: "integration-test-secret-integration-test-secret",
    WEB_ORIGIN: "http://localhost:3000",
    PAYMENT_PROVIDER: "mock",
    STRIPE_WEBHOOK_SECRET: STRIPE_SECRET,
    STORAGE_DRIVER: "local",
    STORAGE_DIR: storageDir,
    EMAIL_PROVIDER: "log",
  });

  const mongoose = (await import("mongoose")).default;
  await mongoose.connect(uri, { dbName: "roofdesk_test" });
  const { createApp } = await import("../src/app");
  const server = createApp().listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  const origin = base.replace("/api/v1", "");

  const call: Call = async (method, p, o = {}) => {
    const headers: Record<string, string> = { ...(o.headers ?? {}) };
    if (o.token) headers.Authorization = `Bearer ${o.token}`;
    if (o.cookie) headers.Cookie = o.cookie;
    let body: BodyInit | undefined;
    if (o.raw) body = o.raw;
    else if (o.body !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(o.body); }
    const res = await fetch(p.startsWith("http") ? p : `${base}${p}`, { method, headers, body });
    const text = await res.text();
    let parsed: any = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* leave as text (CSV) */ }
    return { status: res.status, body: parsed, headers: res.headers };
  };

  const models = {
    Job: (await import("../src/models/Job")).Job,
    User: (await import("../src/models/User")).User,
    Company: (await import("../src/models/Company")).Company,
    Waiver: (await import("../src/models/Waiver")).Waiver,
    Payment: (await import("../src/models/Payment")).Payment,
    LedgerEntry: (await import("../src/models/LedgerEntry")).LedgerEntry,
    MeasurementReport: (await import("../src/models/MeasurementReport")).MeasurementReport,
  };

  return {
    base, origin, call, models, mongoose, storageDir,
    async close() {
      await new Promise((r) => server.close(r));
      await mongoose.disconnect();
      await repl.stop();
    },
  };
}
export type TestApp = Awaited<ReturnType<typeof startTestApp>>;

let counter = 0;
const unique = () => `${Date.now().toString(36)}${counter++}`;

export interface Session { token: string; cookie: string; userId: string; companyId: string; email: string }

const refreshCookie = (h: Headers) => (h.getSetCookie().find((c) => c.startsWith("rd_refresh=")) ?? "").split(";")[0]!;

export async function registerCompany(app: TestApp, name = "Acme Roofing"): Promise<Session> {
  const email = `owner-${unique()}@example.com`;
  const r = await app.call("POST", "/auth/register", { body: { companyName: name, name: "Olivia Owner", email, password: PASSWORD } });
  if (r.status !== 201) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.body)}`);
  return { token: r.body.accessToken, cookie: refreshCookie(r.headers), userId: r.body.user.id, companyId: r.body.user.company.id, email };
}

/** Adds a second person to the same company with a given role, then logs them in. */
export async function addUser(app: TestApp, companyId: string, role: string): Promise<Session> {
  const email = `${role}-${unique()}@example.com`;
  const u = await app.models.User.create({ companyId, name: `${role} person`, email, role, passwordHash: await argon2.hash(PASSWORD) });
  const r = await app.call("POST", "/auth/login", { body: { email, password: PASSWORD } });
  return { token: r.body.accessToken, cookie: refreshCookie(r.headers), userId: u.id, companyId, email };
}

export async function createJob(app: TestApp, s: Session, customer = "Casey Customer"): Promise<string> {
  const r = await app.call("POST", "/jobs", { token: s.token, body: { customer: { name: customer }, property: { line1: "14 Oak Ridge Ln", city: "Austin", state: "TX", zip: "78701" }, type: "insurance" } });
  if (r.status !== 201) throw new Error(`createJob failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.id;
}

/** Inserts a delivered measurement directly, so tests do not wait for the mock provider's delay. */
export async function seedMeasurement(app: TestApp, companyId: string, jobId: string, status = "delivered"): Promise<string> {
  const { Types } = app.mongoose;
  const id = new Types.ObjectId();
  await app.models.MeasurementReport.collection.insertOne({
    _id: id, companyId: new Types.ObjectId(companyId), jobId: new Types.ObjectId(jobId), provider: "mock", status,
    facets: [{ id: "A", areaSqFt: 1400, pitch: "7/12" }, { id: "B", areaSqFt: 1400, pitch: "5/12" }],
    linear: { ridge: 40, hip: 60, valley: 20, eave: 120, rake: 40 },
    totals: { areaSqFt: 2800, squares: 28, wastePct: 12 }, createdAt: new Date(), updatedAt: new Date(),
  });
  return String(id);
}

export async function buildEstimate(app: TestApp, s: Session, jobId: string) {
  const measurementId = await seedMeasurement(app, s.companyId, jobId);
  return app.call("POST", `/jobs/${jobId}/estimate/generate`, { token: s.token, body: { measurementId } });
}

export async function createMilestone(app: TestApp, s: Session, jobId: string, o: { type?: string; amount?: number; requireWaivers?: boolean; label?: string } = {}): Promise<string> {
  const r = await app.call("POST", `/jobs/${jobId}/milestones`, { token: s.token, body: { label: o.label ?? "Draw 1", type: o.type ?? "progress", expectedAmountCents: o.amount ?? 100000, requireWaivers: o.requireWaivers ?? true } });
  if (r.status !== 201) throw new Error(`createMilestone failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.id;
}

export const lastSegment = (url: string) => new URL(url).pathname.split("/").filter(Boolean).pop()!;

export function stripeEvent(id: string, type: string, object: Record<string, unknown>) {
  const body = JSON.stringify({ id, type, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac("sha256", STRIPE_SECRET).update(`${t}.${body}`).digest("hex");
  return { body, signature: `t=${t},v1=${v1}` };
}

export const jpegBytes = (extra = 200) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]), crypto.randomBytes(extra)]);
