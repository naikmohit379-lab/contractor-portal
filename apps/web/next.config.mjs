import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
];

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@roofdesk/shared", "@roofdesk/estimate-engine"],
  poweredByHeader: false,
  // A self-contained server for the Docker image. The tracing root is the repo root so the workspace packages are included.
  output: "standalone",
  outputFileTracingRoot: path.join(here, "../../"),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;
