import { expect, test } from "@playwright/test";

const POST_URL = "/posts/os-performance-bottleneck-diagnosis/";

test("fenced code blocks in the post are rendered by Expressive Code", async ({ page }) => {
  await page.goto(POST_URL);

  const blocks = page.locator(".prose .expressive-code");
  await expect(blocks).not.toHaveCount(0);
  await expect(blocks.first().locator(".ec-line")).not.toHaveCount(0);
  await expect(blocks.first().locator("button[title='Copy to clipboard']")).toHaveCount(1);
});

test("code blocks follow the site theme toggle", async ({ page }) => {
  await page.goto(POST_URL);

  const pre = page.locator(".expressive-code pre").first();
  const background = () => pre.evaluate((element) => getComputedStyle(element).backgroundColor);

  const light = await background();
  await page.getByTestId("theme-toggle").click();
  const dark = await background();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(dark).not.toBe(light);
});
