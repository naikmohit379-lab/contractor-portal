import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createLocalStorage, createS3Storage, newStorageKey } from "./storage";

describe("local storage", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rd-store-"));
  const d = createLocalStorage(root);

  it("stores, reads and deletes, and never overwrites", async () => {
    const key = newStorageKey("c1", "j1", "jpg");
    expect(key).toMatch(/^c1\/j1\/[0-9a-f-]{36}\.jpg$/);
    await d.put(key, Buffer.from("hello"), "image/jpeg");
    expect((await d.get(key)).toString()).toBe("hello");
    await expect(d.put(key, Buffer.from("again"), "image/jpeg")).rejects.toThrow();
    await d.delete(key);
    await expect(d.get(key)).rejects.toThrow();
    await d.delete(key); // deleting twice is fine
  });
  it("cannot be steered outside its folder", async () => {
    await expect(d.get("../../etc/passwd")).rejects.toThrow(/Invalid storage key/);
    await expect(d.put("../outside.txt", Buffer.from("x"), "text/plain")).rejects.toThrow(/Invalid storage key/);
  });
});

describe("S3 storage request shape", () => {
  const calls: { url: string; init: any }[] = [];
  const fake = (async (url: string, init: any) => {
    calls.push({ url, init });
    return { ok: true, arrayBuffer: async () => new Uint8Array(Buffer.from("data")).buffer };
  }) as unknown as typeof fetch;

  it("uses path-style addresses for MinIO and signs the request", async () => {
    const s3 = createS3Storage({ endpoint: "http://localhost:9000", bucket: "roofdesk", region: "us-east-1", accessKeyId: "k", secretAccessKey: "s", pathStyle: true }, fake);
    await s3.put("c1/j1/a b.jpg", Buffer.from("xyz"), "image/jpeg");
    expect(calls[0]!.url).toBe("http://localhost:9000/roofdesk/c1/j1/a%20b.jpg");
    expect(calls[0]!.init.method).toBe("PUT");
    expect(calls[0]!.init.headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=k\//);
    expect("host" in calls[0]!.init.headers).toBe(false);
    expect((await s3.get("c1/j1/x.jpg")).toString()).toBe("data");
  });
  it("uses virtual-host addresses for AWS", async () => {
    const s3 = createS3Storage({ endpoint: "https://s3.us-east-1.amazonaws.com", bucket: "my-bucket", region: "us-east-1", accessKeyId: "k", secretAccessKey: "s", pathStyle: false }, fake);
    await s3.delete("k.jpg");
    expect(calls.at(-1)!.url).toBe("https://my-bucket.s3.us-east-1.amazonaws.com/k.jpg");
  });
});
