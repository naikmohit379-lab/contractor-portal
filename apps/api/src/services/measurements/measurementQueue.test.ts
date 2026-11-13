import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueJSON: vi.fn(),
  upsert: vi.fn(),
  env: {
    MEASUREMENT_QUEUE_ENABLED: true,
    QSTASH_TOKEN: "test-qstash-token",
    QSTASH_CURRENT_SIGNING_KEY: "current-test-key",
    QSTASH_NEXT_SIGNING_KEY: "next-test-key",
    MEASUREMENT_QUEUE_CALLBACK_URL: "https://roofora.example/api/v1/internal/measurements/process",
    VERCEL_AUTOMATION_BYPASS_SECRET: "test-vercel-bypass-secret",
    VERCEL: "1",
  },
}));

vi.mock("@upstash/qstash", () => ({
  Client: class {
    queue() {
      return { enqueueJSON: mocks.enqueueJSON, upsert: mocks.upsert };
    }
  },
}));
vi.mock("../../config/env", () => ({ env: mocks.env }));

import { enqueueMeasurementReport } from "./measurementQueue";

describe("QStash measurement queue delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
    mocks.enqueueJSON.mockResolvedValue({ messageId: "message-test-id" });
    mocks.env.VERCEL_AUTOMATION_BYPASS_SECRET = "test-vercel-bypass-secret";
  });

  it("forwards the Vercel protection bypass header and redacts it from QStash logs", async () => {
    await enqueueMeasurementReport("report-id", "roofv-report-job");

    expect(mocks.enqueueJSON).toHaveBeenCalledWith(expect.objectContaining({
      headers: { "x-vercel-protection-bypass": "test-vercel-bypass-secret" },
      redact: { header: ["x-vercel-protection-bypass"] },
    }));
  });

  it("does not forward a bypass header when the Vercel secret is absent", async () => {
    mocks.env.VERCEL_AUTOMATION_BYPASS_SECRET = undefined as unknown as string;

    await enqueueMeasurementReport("report-id", "roofv-report-job-2");

    expect(mocks.enqueueJSON).toHaveBeenCalledWith(expect.objectContaining({
      headers: undefined,
      redact: undefined,
    }));
  });
});
