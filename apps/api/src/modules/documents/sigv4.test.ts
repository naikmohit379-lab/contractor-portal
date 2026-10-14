import { describe, expect, it } from "vitest";
import { authorizationHeader, awsEncode, hashPayload, presignUrl } from "./sigv4";

// Examples published in the AWS S3 documentation. If our signing drifts, these fail.
const creds = { accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", region: "us-east-1" };

describe("AWS Signature Version 4", () => {
  it("reproduces the documented presigned GET URL signature", () => {
    const url = presignUrl(creds, { method: "GET", scheme: "https", host: "examplebucket.s3.amazonaws.com", path: "/test.txt", expiresSeconds: 86400, amzDate: "20130524T000000Z" });
    expect(url.endsWith("X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404")).toBe(true);
  });
  it("reproduces the documented PUT Object Authorization header", () => {
    const hash = hashPayload("Welcome to Amazon S3.");
    expect(hash).toBe("44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072");
    const auth = authorizationHeader(creds, {
      method: "PUT",
      path: "/" + awsEncode("test$file.text", false),
      payloadHash: hash,
      amzDate: "20130524T000000Z",
      headers: { date: "Fri, 24 May 2013 00:00:00 GMT", host: "examplebucket.s3.amazonaws.com", "x-amz-content-sha256": hash, "x-amz-date": "20130524T000000Z", "x-amz-storage-class": "REDUCED_REDUNDANCY" },
    });
    expect(auth.endsWith("Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd")).toBe(true);
    expect(auth).toContain("SignedHeaders=date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class");
  });
  it("encodes the way AWS expects", () => {
    expect(awsEncode("a b/c!'()*~")).toBe("a%20b%2Fc%21%27%28%29%2A~");
    expect(awsEncode("a b/c", false)).toBe("a%20b/c");
  });
});
