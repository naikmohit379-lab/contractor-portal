import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["cjs"],
  // Vercel packages the compiled Express entrypoint as a function. Bundle the
  // JS runtime dependencies so the function does not depend on a separate
  // node_modules tree, including the pure WebAssembly verifier for legacy hashes.
  noExternal: [
    "@roofdesk/shared",
    "@roofdesk/estimate-engine",
    "bcryptjs",
    "hash-wasm",
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
  clean: true,
});
