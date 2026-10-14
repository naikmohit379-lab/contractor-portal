import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createJob, registerCompany, startTestApp, type Session, type TestApp } from "./helpers";

let app: TestApp;
let a: Session;
let b: Session;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const closers: (() => void)[] = [];

beforeAll(async () => { app = await startTestApp(); a = await registerCompany(app, "Live A"); b = await registerCompany(app, "Live B"); });
afterAll(async () => { closers.forEach((c) => c()); await app.close(); });

/** Opens the live stream the way the browser does (fetch with a bearer token) and collects what arrives. */
async function openStream(token: string) {
  const ctrl = new AbortController();
  closers.push(() => ctrl.abort());
  const res = await fetch(`${app.base}/events`, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
  const events: any[] = [];
  (async () => {
    try {
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, i).split("\n").find((l) => l.startsWith("data: "));
          buf = buf.slice(i + 2);
          if (line) events.push(JSON.parse(line.slice(6)));
        }
      }
    } catch { /* stream closed */ }
  })();
  return {
    status: res.status,
    contentType: res.headers.get("content-type"),
    events,
    async waitFor(pred: (e: any) => boolean, ms = 3000) {
      const end = Date.now() + ms;
      while (Date.now() < end) { const e = events.find(pred); if (e) return e; await sleep(25); }
      return null;
    },
  };
}

describe("live event stream", () => {
  it("needs a login", async () => {
    expect((await fetch(`${app.base}/events`)).status).toBe(401);
  });
  it("tells the company's open tabs to refresh when something changes, and nobody else", async () => {
    const mine = await openStream(a.token);
    const theirs = await openStream(b.token);
    expect(mine.status).toBe(200);
    expect(mine.contentType).toContain("text/event-stream");

    await createJob(app, a);
    const evt = await mine.waitFor((e) => e.type === "invalidate");
    expect(evt).not.toBeNull();
    expect(evt.keys).toContainEqual(["jobs", "summary"]);

    await sleep(400);
    expect(theirs.events).toHaveLength(0); // another company sees nothing
  });
});
