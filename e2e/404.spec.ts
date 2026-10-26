import { expect, test } from "@playwright/test";

test("the 404 page renders in Korean with the requested path shown", async ({ page }) => {
  await page.goto("/never-printed/");

  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "이 페이지는 인쇄된 적이 없습니다.",
  );
  await expect(page.locator("#notfound-path")).toHaveText("/never-printed/");
  await expect(page.getByRole("link", { name: "[ 뒤로 ]" })).toHaveAttribute("href", "/");
});
