import crypto from "node:crypto";

// AWS Signature Version 4 for S3 (and S3-compatible stores such as MinIO), using only node:crypto.

const sha256 = (data: string | Buffer) => crypto.createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => crypto.createHmac("sha256", key).update(data).digest();

export const hashPayload = (body: Buffer | string) => sha256(body);

/** AWS-style percent encoding: everything except A-Z a-z 0-9 - _ . ~ ; the slash is kept only in object paths. */
export function awsEncode(s: string, encodeSlash = true): string {
  const out = encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return encodeSlash ? out : out.replace(/%2F/g, "/");
}

export interface Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service?: string; // default "s3"
}

const scopeOf = (dateStamp: string, c: Credentials) => `${dateStamp}/${c.region}/${c.service ?? "s3"}/aws4_request`;

function signingKey(c: Credentials, dateStamp: string) {
  const kDate = hmac(`AWS4${c.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, c.region);
  const kService = hmac(kRegion, c.service ?? "s3");
  return hmac(kService, "aws4_request");
}

const canonicalQuery = (q: Record<string, string>) =>
  Object.keys(q)
    .map((k) => [awsEncode(k), awsEncode(q[k]!)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

function signature(c: Credentials, amzDate: string, canonicalRequest: string) {
  const dateStamp = amzDate.slice(0, 8);
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scopeOf(dateStamp, c), sha256(canonicalRequest)].join("\n");
  return crypto.createHmac("sha256", signingKey(c, dateStamp)).update(stringToSign).digest("hex");
}

export interface HeaderSignInput {
  method: string;
  /** Path as it will be sent, with each segment already AWS-encoded (use awsEncode(key, false)). */
  path: string;
  query?: Record<string, string>;
  /** Every header that must be covered by the signature, including host and x-amz-date. */
  headers: Record<string, string>;
  payloadHash: string;
  amzDate: string; // YYYYMMDD'T'HHMMSS'Z'
}

/** Builds the value of the Authorization header for a request. */
export function authorizationHeader(c: Credentials, i: HeaderSignInput): string {
  const names = Object.keys(i.headers).map((h) => h.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(i.headers).map(([k, v]) => [k.toLowerCase(), v.trim().replace(/\s+/g, " ")]));
  const canonicalHeaders = names.map((n) => `${n}:${lower[n]}\n`).join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [i.method, i.path, canonicalQuery(i.query ?? {}), canonicalHeaders, signedHeaders, i.payloadHash].join("\n");
  const sig = signature(c, i.amzDate, canonicalRequest);
  return `AWS4-HMAC-SHA256 Credential=${c.accessKeyId}/${scopeOf(i.amzDate.slice(0, 8), c)},SignedHeaders=${signedHeaders},Signature=${sig}`;
}

export interface PresignInput {
  method: string;
  scheme: "http" | "https";
  host: string; // includes the port when it is not the default
  path: string; // already AWS-encoded
  expiresSeconds: number;
  amzDate: string;
}

/** A URL that grants one request for a limited time, with the signature in the query string. */
export function presignUrl(c: Credentials, i: PresignInput): string {
  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${c.accessKeyId}/${scopeOf(i.amzDate.slice(0, 8), c)}`,
    "X-Amz-Date": i.amzDate,
    "X-Amz-Expires": String(i.expiresSeconds),
    "X-Amz-SignedHeaders": "host",
  };
  const cq = canonicalQuery(query);
  const canonicalRequest = [i.method, i.path, cq, `host:${i.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const sig = signature(c, i.amzDate, canonicalRequest);
  return `${i.scheme}://${i.host}${i.path}?${cq}&X-Amz-Signature=${sig}`;
}

export const amzDateOf = (d = new Date()) => d.toISOString().replace(/[:-]|\.\d{3}/g, "");
