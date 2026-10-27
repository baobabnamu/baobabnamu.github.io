import { expect, test } from "@playwright/test";

// About's sub-pages (Introduce/Project/History) follow the same "hidden
// from the main nav, visible via a page-local sidebar nav" shape as
// Posts > Categories > <category> — see categories.spec.ts.

test("About shows Introduce current and links to Project/History", async ({ page }) => {
  await page.goto("/about/");

  const nav = page.getByRole("main").getByRole("navigation", { name: "About" });
  await expect(nav.getByRole("link", { name: "INTRODUCE", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.getByRole("link", { name: "PROJECT", exact: true })).toHaveAttribute(
    "href",
    "/about/project/",
  );
  await expect(nav.getByRole("link", { name: "HISTORY", exact: true })).toHaveAttribute(
    "href",
    "/about/history/",
  );
});

test("following the Project link lands on /about/project/ with Project current", async ({
  page,
}) => {
  await page.goto("/about/");

  await page
    .getByRole("main")
    .getByRole("navigation", { name: "About" })
    .getByRole("link", { name: "PROJECT", exact: true })
    .click();

  await expect(page).toHaveURL(/\/about\/project\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("준비 중입니다.");
  const nav = page.getByRole("main").getByRole("navigation", { name: "About" });
  await expect(nav.getByRole("link", { name: "PROJECT", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("following the History link lands on /about/history/ with History current", async ({
  page,
}) => {
  await page.goto("/about/");

  await page
    .getByRole("main")
    .getByRole("navigation", { name: "About" })
    .getByRole("link", { name: "HISTORY", exact: true })
    .click();

  await expect(page).toHaveURL(/\/about\/history\/$/);
  const nav = page.getByRole("main").getByRole("navigation", { name: "About" });
  await expect(nav.getByRole("link", { name: "HISTORY", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("the old /portfolio URL redirects into /about/project/", async ({ page }) => {
  const response = await page.goto("/portfolio/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/about\/project\/?$/);
});
