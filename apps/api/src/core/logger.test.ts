import { describe, expect, it } from "vitest";
import { serializeRequestForLog, serializeResponseForLog } from "./requestLogger";

describe("serializeRequestForLog", () => {
  it("omits all request headers from structured logs", () => {
    const result = serializeRequestForLog({
      id: "request-1",
      method: "POST",
      url: "/api/v1/webhooks/razorpay/company-id",
      remoteAddress: "127.0.0.1",
      remotePort: 1234,
      headers: {
        authorization: "Bearer secret",
        cookie: "session=secret",
        "x-vercel-protection-bypass": "bypass-secret",
        "x-razorpay-signature": "webhook-signature",
      },
    } as Parameters<typeof serializeRequestForLog>[0]);

    expect(result).toEqual({
      id: "request-1",
      method: "POST",
      url: "/api/v1/webhooks/razorpay/company-id",
      remoteAddress: "127.0.0.1",
      remotePort: 1234,
    });
    expect(JSON.stringify(result)).not.toMatch(/secret|signature/i);
  });
});

describe("serializeResponseForLog", () => {
  it("keeps the status code but omits response headers such as refresh cookies", () => {
    const result = serializeResponseForLog({
      statusCode: 200,
      headers: {
        "set-cookie": "rd_refresh=secret-session-token; HttpOnly; Secure",
        authorization: "Bearer secret-token",
      },
    } as Parameters<typeof serializeResponseForLog>[0]);

    expect(result).toEqual({ statusCode: 200 });
    expect(JSON.stringify(result)).not.toMatch(/secret|rd_refresh|cookie|authorization/i);
  });
});
