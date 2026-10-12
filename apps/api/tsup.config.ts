import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["cjs"],
  noExternal: ["@roofdesk/shared", "@roofdesk/estimate-engine"],
  clean: true,
});
