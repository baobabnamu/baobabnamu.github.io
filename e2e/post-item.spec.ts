import { expect, test, type Page } from "@playwright/test";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

// Post rows are the list items holding a link into `/posts/…`; the category
// nav links into `/posts/categories/…` instead, so it is excluded here.
const postRows = (page: Page) =>
  page
    .getByRole("main")
    .locator("li")
    .filter({ has: page.locator('a[href*="/posts/"]:not([href*="/posts/categories/"])') });

test("home lists posts with a link to each post and its date", async ({ page }) => {
  await page.goto("/");

  const rows = page.getByRole("main").getByRole("listitem");
  await expect(rows).not.toHaveCount(0);
  await expect(rows.first().getByRole("link")).toHaveAttribute("href", /^\/posts\/.+\/$/);
  await expect(rows.first().getByText(datePattern)).toBeVisible();
});

test("the posts index lists posts with a link and a date", async ({ page }) => {
  await page.goto("/posts/");

  const rows = postRows(page);
  await expect(rows).not.toHaveCount(0);
  await expect(rows.first().getByRole("link")).toHaveAttribute("href", /^\/posts\/.+\/$/);
  await expect(rows.first().getByText(datePattern)).toBeVisible();
});

// There's only one post in one category today, so the "N more" overflow
// control never renders — nothing to assert here until there's enough
// content per category to trigger it.

test("long titles do not make the page scroll sideways on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/posts/");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
