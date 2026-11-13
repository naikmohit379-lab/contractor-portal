import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), process: vi.fn(), warn: vi.fn() }));

vi.mock("@upstash/qstash", () => ({
  Receiver: class {
    verify = mocks.verify;
  },
}));
vi.mock("../../config/env", () => ({
  env: {
    MEASUREMENT_QUEUE_ENABLED: true,
    QSTASH_TOKEN: "test-token",
    QSTASH_CURRENT_SIGNING_KEY: "current-test-signing-key",
    QSTASH_NEXT_SIGNING_KEY: "next-test-signing-key",
    MEASUREMENT_QUEUE_CALLBACK_URL: "https://roofora.example/api/v1/internal/measurements/process",
  },
}));
vi.mock("../../core/logger", () => ({ logger: { warn: mocks.warn } }));
vi.mock("./measurements.routes", () => ({ processQueuedMeasurementReport: mocks.process }));

import { measurementQueueHandler } from "./measurementQueue.routes";

function request(body: unknown, signature?: string) {
  return {
    body: Buffer.from(JSON.stringify(body)),
    header: (name: string) => name.toLowerCase() === "upstash-signature" ? signature : undefined,
  } as any;
}

function response() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    set(name: string, value: string) { this.headers[name] = value; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  return res;
}

describe("QStash measurement callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue(true);
    mocks.process.mockResolvedValue("processed");
  });

  it("rejects an unsigned delivery without processing the report", async () => {
    const res = response();
    await measurementQueueHandler(request({ reportId: "6ae5a7326e87b83bfdf7a6e5", jobKey: "roofv:test" }), res);
    expect(res.statusCode).toBe(401);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("verifies the raw message and processes the existing report only", async () => {
    const body = { reportId: "6ae5a7326e87b83bfdf7a6e5", jobKey: "roofv:test" };
    const req = request(body, "signed-test-message");
    const res = response();
    await measurementQueueHandler(req, res);
    expect(mocks.verify).toHaveBeenCalledWith({
      signature: "signed-test-message",
      body: req.body.toString("utf8"),
      url: "https://roofora.example/api/v1/internal/measurements/process",
    });
    expect(mocks.process).toHaveBeenCalledWith(body.reportId, body.jobKey);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, result: "processed" });
  });

  it("marks malformed messages as non-retryable", async () => {
    const res = response();
    await measurementQueueHandler(request({ reportId: "bad-id", jobKey: "roofv:test" }, "signed-test-message"), res);
    expect(res.statusCode).toBe(400);
    expect(res.headers["Upstash-NonRetryable-Error"]).toBe("true");
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("returns a retryable response if the worker cannot claim a duplicate", async () => {
    mocks.process.mockRejectedValue(new Error("busy"));
    const res = response();
    await measurementQueueHandler(request({ reportId: "6ae5a7326e87b83bfdf7a6e5", jobKey: "roofv:test" }, "signed-test-message"), res);
    expect(res.statusCode).toBe(503);
    expect(mocks.warn).toHaveBeenCalled();
  });
});
