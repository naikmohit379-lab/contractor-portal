import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApp, type TestApp } from "./helpers";

let app: TestApp;

beforeAll(async () => { app = await startTestApp(); });
afterAll(async () => { await app?.close(); });

describe("production health probes", () => {
  it("exposes unauthenticated liveness and database readiness routes under the Vercel API path", async () => {
    const health = await app.call("GET", "/health");
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ ok: true });

    const ready = await app.call("GET", "/ready");
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ ok: true });
  });
});
