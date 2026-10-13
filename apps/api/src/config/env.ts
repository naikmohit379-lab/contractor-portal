import "dotenv/config";
import { z } from "zod";

const defaultWebOrigin = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().min(1),
  WEB_ORIGIN: z.string().default(defaultWebOrigin),
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
});

export const env = schema.parse(process.env);
export const isProd = env.NODE_ENV === "production";
