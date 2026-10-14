import { defineConfig, devices } from "@playwright/test";

const WEB = process.env.E2E_WEB_URL ?? "http://localhost:3000";

// Runs the real API and web app and drives them in a real browser, on a desktop and a phone-sized screen.
// Needs MongoDB (run `docker compose up -d`). Set E2E_NO_SERVER=1 to test servers you started yourself.
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: WEB, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : [
        { command: "pnpm --filter @roofdesk/api dev", url: "http://localhost:4000/ready", reuseExistingServer: !process.env.CI, timeout: 120_000 },
        { command: "pnpm --filter @roofdesk/web dev", url: WEB, reuseExistingServer: !process.env.CI, timeout: 120_000 },
      ],
});
