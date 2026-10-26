import { expect, test } from "@playwright/test";

// The sub-path the site is deployed to, mirroring a GitHub Pages project site.
const BASE = "/print";

// The host serves the single `404.html` from the deployment root while
// keeping the broken URL — this confirms the shown path still carries the
// sub-path rather than being stripped or doubled.
test("the 404 page handles the deployment sub-path", async ({ page }) => {
  await page.goto(`${BASE}/never-printed/`);

  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "이 페이지는 인쇄된 적이 없습니다.",
  );
  await expect(page.locator("#notfound-path")).toHaveText(`${BASE}/never-printed/`);
  await expect(page.getByRole("link", { name: "[ 뒤로 ]" })).toHaveAttribute(
    "href",
    `${BASE}/`,
  );
});
