import { expect, test, type Page } from "@playwright/test";

// Only one post/category exists today ("ops"), so the old multi-category
// preview/overflow and cross-language tests don't apply — trimmed to what's
// actually testable against this content, matching the structural/responsive
// checks that still hold with a single category.

const categoriesNav = (page: Page) =>
  page.getByRole("main").getByRole("navigation", { name: "Category" });

const postRows = (page: Page) =>
  page
    .getByRole("main")
    .locator("li")
    .filter({ has: page.locator('a[href*="/posts/"]:not([href*="/posts/categories/"])') });

test("home category heading links into that category's page", async ({ page }) => {
  await page.goto("/");

  const heading = page.getByRole("main").getByRole("heading", { level: 3 }).first();
  const link = heading.getByRole("link");
  await expect(link).toHaveAttribute("href", "/posts/categories/ops/");

  await link.click();
  await expect(page).toHaveURL(/\/posts\/categories\/ops\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("OPS");
});

test("the category page marks the current category and lists only its posts", async ({ page }) => {
  await page.goto("/posts/categories/ops/");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("OPS");

  const nav = categoriesNav(page);
  await expect(nav.getByRole("link", { name: "OPS", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );

  const countText = await page
    .getByRole("main")
    .getByText(/^\d+개$/)
    .textContent();
  const count = Number(countText?.match(/^\d+/)?.[0]);
  expect(count).toBeGreaterThan(0);
  await expect(postRows(page)).toHaveCount(count);
});

test("the category list sits beside the sidebar instead of centered", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/posts/categories/ops/");

  const sidebarBox = (await page.getByTestId("sidebar").boundingBox())!;
  const navBox = (await categoriesNav(page).boundingBox())!;

  expect(navBox.x).toBeGreaterThan(sidebarBox.x + sidebarBox.width);
  expect(navBox.x - (sidebarBox.x + sidebarBox.width)).toBeLessThan(48);
});

test("a post page shows the category nav with its own category current", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/posts/os-performance-bottleneck-diagnosis/");

  const nav = categoriesNav(page);
  const article = page.getByRole("main").getByRole("article");
  await expect(nav).toBeVisible();
  await expect(article).toBeVisible();
  await expect(nav.getByRole("link", { name: "OPS", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("a post's category label links to its category page", async ({ page }) => {
  await page.goto("/posts/os-performance-bottleneck-diagnosis/");

  const categoryLink = page.getByRole("article").getByRole("link", { name: "OPS", exact: true });
  await expect(categoryLink).toHaveAttribute("href", "/posts/categories/ops/");
  await categoryLink.click();
  await expect(page).toHaveURL(/\/posts\/categories\/ops\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("OPS");
});

test("the category list stacks above the posts on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/posts/categories/ops/");

  const nav = categoriesNav(page);
  const firstPost = postRows(page).first();
  await expect(nav).toBeVisible();
  await expect(firstPost).toBeVisible();

  const navY = (await nav.boundingBox())!.y;
  const postY = (await firstPost.boundingBox())!.y;
  expect(navY).toBeLessThan(postY);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
