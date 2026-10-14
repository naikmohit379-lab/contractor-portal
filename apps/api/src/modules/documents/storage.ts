import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { amzDateOf, authorizationHeader, awsEncode, hashPayload, type Credentials } from "./sigv4";

/** Where uploaded files live. The database keeps only the key; the bytes are here. */
export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/** Storage keys are made by the server from ids and a random name, never from anything a user typed. */
export const newStorageKey = (companyId: string, jobId: string, ext: string) => `${companyId}/${jobId}/${randomUUID()}.${ext}`;

// ---------------------------------------------------------------- local disk (development)
export function createLocalStorage(root: string): StorageDriver {
  const base = path.resolve(root);
  const resolve = (key: string) => {
    const full = path.resolve(base, key);
    // Defence in depth: even a bad key can never point outside the storage folder.
    if (full !== base && !full.startsWith(base + path.sep)) throw new Error("Invalid storage key");
    return full;
  };
  return {
    async put(key, body) {
      const file = resolve(key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, body, { flag: "wx" }); // never overwrite an existing object
    },
    async get(key) {
      return fs.readFile(resolve(key));
    },
    async delete(key) {
      await fs.rm(resolve(key), { force: true });
    },
  };
}

// ---------------------------------------------------------------- S3 or MinIO
export interface S3Config {
  endpoint: string; // e.g. https://s3.us-east-1.amazonaws.com or http://localhost:9000
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  pathStyle: boolean; // true for MinIO
}

export function createS3Storage(cfg: S3Config, fetchImpl: typeof fetch = fetch): StorageDriver {
  const url = new URL(cfg.endpoint);
  const creds: Credentials = { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, region: cfg.region };

  async function call(method: "PUT" | "GET" | "DELETE", key: string, body?: Buffer, contentType?: string) {
    const host = cfg.pathStyle ? url.host : `${cfg.bucket}.${url.host}`;
    const pathPart = cfg.pathStyle ? `/${awsEncode(cfg.bucket)}/${awsEncode(key, false)}` : `/${awsEncode(key, false)}`;
    const payloadHash = hashPayload(body ?? "");
    const amzDate = amzDateOf();
    const headers: Record<string, string> = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
    if (contentType) headers["content-type"] = contentType;
    const authorization = authorizationHeader(creds, { method, path: pathPart, headers, payloadHash, amzDate });
    const { host: _h, ...sendHeaders } = headers; // fetch sets Host itself, from the URL
    const res = await fetchImpl(`${url.protocol}//${host}${pathPart}`, { method, headers: { ...sendHeaders, Authorization: authorization }, body: body ? Uint8Array.from(body) : undefined });
    if (!res.ok) throw new Error(`Storage ${method} failed (${res.status})`);
    return res;
  }

  return {
    async put(key, body, contentType) { await call("PUT", key, body, contentType); },
    async get(key) { return Buffer.from(await (await call("GET", key)).arrayBuffer()); },
    async delete(key) { await call("DELETE", key); },
  };
}
