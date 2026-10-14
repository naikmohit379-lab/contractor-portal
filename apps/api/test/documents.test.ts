import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addUser, createJob, jpegBytes, registerCompany, startTestApp, type Session, type TestApp } from "./helpers";

let app: TestApp;
let s: Session;
let other: Session;
let job: string;
let docId = "";
const bytes = jpegBytes(500);

const upload = (who: Session, buf: Buffer, type = "image/jpeg", name = "roof front.jpg") =>
  app.call("POST", `/jobs/${job}/documents`, { token: who.token, raw: buf, headers: { "Content-Type": type, "X-File-Name": encodeURIComponent(name) } });
const filesOnDisk = () => {
  const dir = path.join(app.storageDir, s.companyId, job);
  return fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
};

beforeAll(async () => {
  app = await startTestApp();
  s = await registerCompany(app, "Photo Co");
  other = await registerCompany(app, "Other Co");
  job = await createJob(app, s);
});
afterAll(() => app.close());

describe("uploading", () => {
  it("stores a photo, recording its real type and a checksum", async () => {
    const r = await upload(s, bytes);
    expect(r.status).toBe(201);
    expect(r.body.contentType).toBe("image/jpeg");
    expect(r.body.kind).toBe("photo");
    expect(r.body.filename).toBe("roof front.jpg");
    expect(r.body.sha256).toBe(crypto.createHash("sha256").update(bytes).digest("hex"));
    docId = r.body.id;
    expect(filesOnDisk()).toBe(1);
  });
  it("refuses a script that claims to be a photo", async () => {
    const r = await upload(s, Buffer.from("<script>alert(1)</script>".padEnd(64, " ")), "image/jpeg", "photo.jpg");
    expect(r.status).toBe(415);
    expect(filesOnDisk()).toBe(1);
  });
  it("refuses an empty body and an oversized file", async () => {
    expect((await upload(s, Buffer.alloc(0))).status).toBe(422);
    const big = Buffer.concat([bytes.subarray(0, 12), Buffer.alloc(16 * 1024 * 1024)]);
    const r = await upload(s, big);
    expect(r.status).toBe(413);
    expect(r.body.error.code).toBe("too_large");
  });
  it("is not open to read-only people", async () => {
    const ro = await addUser(app, s.companyId, "readonly");
    expect((await upload(ro, bytes)).status).toBe(403);
  });
});

describe("reading and protecting files", () => {
  it("returns the exact bytes under a locked-down policy", async () => {
    const res = await fetch(`${app.base}/jobs/${job}/documents/${docId}/file`, { headers: { Authorization: `Bearer ${s.token}` } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await res.arrayBuffer()).equals(bytes)).toBe(true);
  });
  it("needs a login, and another company cannot see it", async () => {
    expect((await fetch(`${app.base}/jobs/${job}/documents/${docId}/file`)).status).toBe(401);
    const res = await fetch(`${app.base}/jobs/${job}/documents/${docId}/file`, { headers: { Authorization: `Bearer ${other.token}` } });
    expect(res.status).toBe(404);
    expect((await app.call("GET", `/jobs/${job}/documents`, { token: other.token })).body.items).toHaveLength(0);
  });
});

describe("marking up", () => {
  it("saves markers, caption and slope, and rejects a marker outside the picture", async () => {
    const ok = await app.call("PATCH", `/jobs/${job}/documents/${docId}`, { token: s.token, body: { caption: "Hail on the south slope", slope: "front", includeInPacket: true, annotations: [{ id: "m1", x: 0.4, y: 0.6, kind: "hail", note: "6 hits" }] } });
    expect(ok.status).toBe(200);
    expect(ok.body.annotations[0]).toMatchObject({ id: "m1", kind: "hail" });
    const bad = await app.call("PATCH", `/jobs/${job}/documents/${docId}`, { token: s.token, body: { annotations: [{ id: "m2", x: 1.5, y: 0.1, kind: "hail" }] } });
    expect(bad.status).toBe(422);
  });
});

describe("deleting", () => {
  it("removes the record and the stored file", async () => {
    expect((await app.call("DELETE", `/jobs/${job}/documents/${docId}`, { token: s.token })).status).toBe(204);
    expect(filesOnDisk()).toBe(0);
    expect((await fetch(`${app.base}/jobs/${job}/documents/${docId}/file`, { headers: { Authorization: `Bearer ${s.token}` } })).status).toBe(404);
  });
});
