import { expect, test } from "@playwright/test";

test("home page renders through the base layout", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Bao의 기술 블로그");
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    "width=device-width, initial-scale=1, viewport-fit=cover",
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "목적에 맞는 기술을 선택할 수 있는 엔지니어",
  );
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bao의 기술 블로그");
});

test("home groups posts under their category heading", async ({ page }) => {
  await page.goto("/");

  const heading = page.getByRole("main").getByRole("heading", { level: 3 }).first();
  await expect(heading).toContainText("infra");
  await expect(heading.getByRole("link")).toHaveAttribute(
    "href",
    "/posts/categories/infra/",
  );
});
