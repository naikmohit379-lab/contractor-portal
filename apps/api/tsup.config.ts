import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["cjs"],
  // Vercel packages the compiled Express entrypoint as a function. Bundle the
  // JS runtime dependencies so the function does not depend on a separate
  // node_modules tree. Argon2 is only dynamically loaded for legacy hashes.
  noExternal: [
    "@roofdesk/shared",
    "@roofdesk/estimate-engine",
    "bcryptjs",
    "cookie-parser",
    "cors",
    "dotenv",
    "express",
    "express-rate-limit",
    "helmet",
    "jsonwebtoken",
    "mongoose",
    "pino",
    "pino-http",
    "zod",
  ],
  external: ["argon2"],
  clean: true,
});
