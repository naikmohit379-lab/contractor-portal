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
  test("keeps a photo on device while offline and syncs it after reconnecting", async ({ page, context, isMobile }) => {
    test.skip(isMobile, "the offline upload flow is run on desktop; the phone project covers layout above");
    await registerViaUi(page);
    await page.goto("/jobs");
    await page.getByRole("button", { name: "New job" }).click();
    await page.getByLabel("Customer name").fill("Offline Photo Customer");
    await page.getByLabel("Address line 1").fill("14 Palace Road");
    await page.getByLabel("City / town / locality").fill("Bengaluru");
    await page.getByLabel("District").fill("Bengaluru Urban");
    await page.getByLabel("State / Union Territory").fill("Karnataka");
    await page.getByLabel("PIN code").fill("560001");
    await page.getByRole("button", { name: "Create job" }).click();
    await page.getByRole("link", { name: /Offline Photo Customer/ }).click();
    await page.getByRole("button", { name: "Photos", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Photos and documents" })).toBeVisible();

    await context.setOffline(true);
    await page.getByRole("button", { name: "Upload files" }).click();
    await page.locator('input[type="file"]').nth(1).setInputFiles({
      name: "offline-roof.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]),
    });
    await expect(page.getByRole("region", { name: "Offline photo upload queue" })).toContainText("offline-roof.jpg");
    await expect(page.getByRole("region", { name: "Offline photo upload queue" })).toContainText("Saved offline");

    await context.setOffline(false);
    await expect(page.getByRole("button", { name: "Open offline-roof.jpg" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("region", { name: "Offline photo upload queue" })).toHaveCount(0);
  });

  test("measure, estimate and file a claim", async ({ page, isMobile }) => {
    test.skip(isMobile, "the long flow is run on desktop; the phone project covers layout above");
    await registerViaUi(page);

    await page.goto("/jobs");
    await page.getByRole("button", { name: "New job" }).click();
    await page.getByLabel("Customer name").fill("Casey Customer");
    // This flow covers backward-compatible U.S. claim behavior from an India-default registration.
    await page.getByLabel("Country").selectOption("US");
    await page.getByLabel("Address line 1").fill("14 Oak Ridge Ln");
    await page.getByLabel("City / town / locality").fill("Austin");
    await page.getByLabel("State (2-letter code)").fill("TX");
    await page.getByLabel("ZIP code").fill("78701");
    await page.getByRole("button", { name: "Create job" }).click();
    await page.getByRole("link", { name: /Casey Customer/ }).click();

    await page.getByRole("button", { name: "Order aerial report" }).click();
    await expect(page.getByText("Total area")).toBeVisible({ timeout: 30_000 }); // the live stream refreshes this by itself

    await page.getByRole("button", { name: "Estimate", exact: true }).click();
    await page.getByRole("button", { name: "Build estimate from report" }).click();
    await expect(page.getByRole("region", { name: "Estimate" }).getByText("Net claim")).toBeVisible();

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
