import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 180_000, // the first run downloads a MongoDB binary
    fileParallelism: false, // avoid concurrent MongoDB binary downloads racing on a fresh install
    pool: "forks",
    server: { deps: { inline: [/@roofdesk\//] } }, // the workspace packages are TypeScript source
  },
});
