import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { overflowsHorizontally } from "./helpers";

test.describe("public pages", () => {
  test("the landing page shows the product and fits the screen", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/final payment/i);
    await expect(page.getByRole("link", { name: /start free trial/i }).first()).toBeVisible();
    expect(await overflowsHorizontally(page)).toBe(false);
  });

  test("the phone menu opens", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phone only");
    await page.goto("/");
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.getByRole("navigation", { name: "Mobile" })).toBeVisible();
  });

  for (const path of ["/", "/login", "/register"]) {
    test(`no serious accessibility problems on ${path}`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  }

  for (const path of ["/login", "/register", "/sign/not-a-real-token", "/pay/not-a-real-token", "/confirm/not-a-real-token"]) {
    test(`${path} is kept out of search engines`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    });
  }

  test("robots.txt hides the private areas", async ({ request }) => {
    const body = await (await request.get("/robots.txt")).text();
    for (const p of ["/dashboard", "/jobs", "/payments", "/sign/", "/pay/"]) expect(body).toContain(`Disallow: ${p}`);
  });

  test("a bad signing link says so plainly", async ({ page }) => {
    await page.goto("/sign/not-a-real-token");
    await expect(page.getByText(/not valid/i)).toBeVisible();
  });
});
