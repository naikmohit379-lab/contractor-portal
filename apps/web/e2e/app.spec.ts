import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { overflowsHorizontally, registerViaUi } from "./helpers";

test.describe("signed-in app", () => {
  test("redirects a signed-out visitor to the login page", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("every main screen fits the screen and passes the accessibility scan", async ({ page }) => {
    await registerViaUi(page);
    for (const path of ["/dashboard", "/jobs", "/payments", "/prices", "/settings", "/suppliers", "/waivers"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await overflowsHorizontally(page), `${path} scrolls sideways`).toBe(false);
      const serious = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${path} ${v.id}`)).toEqual([]);
    }
  });

  test("signing out ends the session", async ({ page, isMobile }) => {
    await registerViaUi(page);
    if (isMobile) { await page.getByRole("button", { name: "More" }).click(); await page.getByRole("button", { name: /Sign out/ }).click(); }
    else await page.getByRole("button", { name: /Sign out/ }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("golden path: job to claim", () => {
  test("measure, estimate and file a claim", async ({ page, isMobile }) => {
    test.skip(isMobile, "the long flow is run on desktop; the phone project covers layout above");
    await registerViaUi(page);

    await page.goto("/jobs");
    await page.getByRole("button", { name: "New job" }).click();
    await page.getByLabel("Customer name").fill("Casey Customer");
    await page.getByLabel("Street address").fill("14 Oak Ridge Ln");
    await page.getByLabel("City").fill("Austin");
    await page.getByLabel("State").fill("TX");
    await page.getByLabel("ZIP").fill("78701");
    await page.getByRole("button", { name: "Create job" }).click();
    await page.getByRole("link", { name: /Casey Customer/ }).click();

    await page.getByRole("button", { name: "Order aerial report" }).click();
    await expect(page.getByText("Total area")).toBeVisible({ timeout: 30_000 }); // the live stream refreshes this by itself

    await page.getByRole("button", { name: "Estimate", exact: true }).click();
    await page.getByRole("button", { name: "Build estimate from report" }).click();
    await expect(page.getByText("Net claim")).toBeVisible();

    await page.getByRole("button", { name: "Claim", exact: true }).click();
    await page.getByLabel("Insurance carrier").fill("Acme Mutual");
    await page.getByLabel("Policy number").fill("P-100");
    await page.getByLabel("Claim number").fill("C-200");
    await page.getByLabel("Date of loss").fill("2026-09-01");
    await page.getByRole("button", { name: "Create claim" }).click();
    await expect(page.getByRole("heading", { name: "Acme Mutual" })).toBeVisible();

    await page.getByRole("button", { name: "Submit claim" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Submitted").first()).toBeVisible();
  });
});
