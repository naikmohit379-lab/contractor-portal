import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().min(1),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  // Payments: "mock" simulates a gateway locally; "stripe" uses hosted Stripe Checkout.
  PAYMENT_PROVIDER: z.enum(["mock", "stripe"]).default("mock"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // Email: "log" prints to the server console (development); "resend" sends through the Resend HTTP API.
  EMAIL_PROVIDER: z.enum(["log", "resend"]).default("log"),
  EMAIL_FROM: z.string().default("RoofDesk <no-reply@example.com>"),
  RESEND_API_KEY: z.string().optional(),
  // RoofV is opt-in because each new measurement can consume the workspace allowance.
  ROOFV_ENABLED: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  ROOFV_API_KEY: z.string().optional(),
  ROOFV_API_BASE: z.string().url().default("https://roofv.ai/api/public/v1"),
  // Vercel Cron uses this bearer secret to authenticate scheduled reminder runs.
  CRON_SECRET: z.string().min(16).optional(),
  // File storage for photos and documents. Blob storage is private and suited to Vercel.
  STORAGE_DRIVER: z.enum(["local", "s3", "vercel-blob"]).default("local"),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  STORAGE_DIR: z.string().default("./storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_PATH_STYLE: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
});

export const env = schema.parse(process.env);
export const isProd = env.NODE_ENV === "production";

// Refuse to start in production with settings that would be unsafe. A loud failure at boot beats a quiet hole.
if (isProd) {
  const problems: string[] = [];
  if (/change-me|example|secret/i.test(env.JWT_ACCESS_SECRET)) problems.push("JWT_ACCESS_SECRET is still a placeholder");
  if (!env.WEB_ORIGIN.startsWith("https://")) problems.push("WEB_ORIGIN must be an https:// address in production");
  if (env.PAYMENT_PROVIDER === "stripe" && (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET)) problems.push("Stripe is selected but STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is missing");
  if (env.EMAIL_PROVIDER === "resend" && !env.RESEND_API_KEY) problems.push("Resend is selected but RESEND_API_KEY is missing");
  if (env.ROOFV_ENABLED && !env.ROOFV_API_KEY) problems.push("ROOFV_API_KEY is required when ROOFV_ENABLED=true");
  if (env.STORAGE_DRIVER === "local") console.warn("STORAGE_DRIVER=local: files live on this server's disk. Keep STORAGE_DIR on a persistent, backed-up volume, or use s3.");
  if (env.STORAGE_DRIVER === "vercel-blob" && !env.BLOB_READ_WRITE_TOKEN) problems.push("BLOB_READ_WRITE_TOKEN is required when STORAGE_DRIVER=vercel-blob");
  if (problems.length) throw new Error(`Unsafe production configuration:\n - ${problems.join("\n - ")}`);
}
