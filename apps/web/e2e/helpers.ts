import { expect, type Page } from "@playwright/test";

let n = 0;
export const PASSWORD = "correct horse battery staple";

/** Creates a brand-new company through the real sign-up form and lands on the dashboard. */
export async function registerViaUi(page: Page, company = "E2E Roofing") {
  const email = `e2e-${Date.now().toString(36)}-${n++}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Company name").fill(company);
  await page.getByLabel("Your name").fill("Erin E2E");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  return { email };
}

/** True if the page scrolls sideways, which on a phone means something is spilling off the screen. */
export const overflowsHorizontally = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
