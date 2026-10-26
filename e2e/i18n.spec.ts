import { expect, test } from "@playwright/test";

// This site is Korean-only: no language picker, no `/ko/` URL segment.
// These tests replace the old multi-language switching suite with checks
// that the single-language setup actually produces clean URLs and the
// right `lang` attribute, and that the picker is really gone.

test("the root path renders directly — no redirect to a language subpath", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/$/);
});

test("the page is stamped with the Korean lang attribute", async ({ page }) => {
  for (const path of ["/", "/posts/", "/notes/", "/about/"]) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  }
});

test("navigation renders in Korean with clean, unprefixed URLs", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "홈", exact: true })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "글", exact: true })).toHaveAttribute(
    "href",
    "/posts",
  );
  await expect(page.getByRole("link", { name: "메모", exact: true })).toHaveAttribute(
    "href",
    "/notes",
  );
});

test("there is no language picker — nothing to switch between", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("language-picker-trigger")).toHaveCount(0);
});

test("a post lives at a clean /posts/<slug>/ URL with no language segment", async ({ page }) => {
  await page.goto("/posts/os-performance-bottleneck-diagnosis/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/^(?!.*\/ko\/).*\/posts\/os-performance-bottleneck-diagnosis\/$/);
});
