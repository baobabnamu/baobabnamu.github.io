import { expect, test } from "@playwright/test";

// The sub-path the site is deployed to, mirroring a GitHub Pages project
// site. This exercises `src/utils/base.ts`'s sub-path handling generically —
// unrelated to the Korean-only content/URL flattening — so "print" as an
// example sub-path name is fine to keep as-is.
const BASE = "/print";

test("the site renders from its deployment sub-path", async ({ page }) => {
  const response = await page.goto(`${BASE}/`);

  expect(response?.status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bao의 기술 블로그");
});

test("every internal link accounts for the sub-path", async ({ page }) => {
  await page.goto(`${BASE}/posts/`);

  const hrefs = await page
    .locator('a[href^="/"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));

  expect(hrefs.length).toBeGreaterThan(0);
  expect(hrefs.filter((href) => !href.startsWith(`${BASE}/`))).toEqual([]);
});

test("assets are served from the deployment sub-path", async ({ page }) => {
  await page.goto(`${BASE}/`);

  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute(
    "href",
    `${BASE}/favicon.svg`,
  );
  expect((await page.request.get(`${BASE}/favicon.svg`)).status()).toBe(200);
});

test("a post page stays inside the sub-path", async ({ page }) => {
  await page.goto(`${BASE}/posts/os-performance-bottleneck-diagnosis/`);

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${BASE}/posts/os-performance-bottleneck-diagnosis/$`));
});

test("following an internal link keeps the visitor inside the sub-path", async ({ page }) => {
  await page.goto(`${BASE}/`);

  await page.getByRole("navigation").getByRole("link", { name: "글" }).click();

  await expect(page).toHaveURL(new RegExp(`${BASE}/posts/?$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("글");
});
