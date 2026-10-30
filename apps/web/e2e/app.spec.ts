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

test("password reset request is reachable and confirms generically", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password/);
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await page.getByLabel("Email").fill("unknown-reset@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an active account uses that email");
});

test.describe("India-first job flow", () => {
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

  test("creates an Indian job and keeps U.S. claim and waiver workflows out of the UI", async ({ page, isMobile }) => {
    test.skip(isMobile, "the data-entry flow is run on desktop; the phone project covers layout above");
    await registerViaUi(page);

    await page.goto("/jobs");
    await page.getByRole("button", { name: "New job" }).click();
    await page.getByLabel("Customer name").fill("Bengaluru Customer");
    await page.getByLabel("Address line 1").fill("14 Palace Road");
    await page.getByLabel("City / town / locality").fill("Bengaluru");
    await page.getByLabel("District").fill("Bengaluru Urban");
    await page.getByLabel("State / Union Territory").fill("Karnataka");
    await page.getByLabel("PIN code").fill("560001");
    await page.getByRole("button", { name: "Create job" }).click();
    await page.getByRole("link", { name: /Bengaluru Customer/ }).click();
    await expect(page.getByText(/Bengaluru Urban.*Karnataka.*560001/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Claim", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Waivers", exact: true })).toHaveCount(0);
  });
});
