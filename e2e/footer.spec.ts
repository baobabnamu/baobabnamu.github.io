import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { useTranslations } from "../src/i18n/utils";

// Derive expectations from the same config and translations the page renders
// from, so editing the site config never breaks this test, but dropping or
// mangling a footer link does.
const config = JSON.parse(
  readFileSync(fileURLToPath(new URL("../src/data/config.json", import.meta.url)), "utf8"),
) as {
  site: { brand: { copyright: string; socials: { name: string; url: string }[] } };
};
const { copyright, socials } = config.site.brand;

const t = useTranslations("ko");

test("the footer shows the copyright and social links", async ({ page }) => {
  await page.goto("/");

  const footer = page.getByTestId("footer");
  await expect(footer).toBeVisible();
  await expect(footer).toContainText(copyright);
  await expect(footer).toContainText(t("footer.links"));

  const links = footer.getByRole("link");
  for (const social of socials) {
    await expect(links.filter({ hasText: social.name })).toHaveAttribute("href", social.url);
  }
});

test("every page shows the footer", async ({ page }) => {
  for (const path of ["/", "/posts/"]) {
    await page.goto(path);

    const footer = page.getByTestId("footer");
    await expect(footer).toBeVisible();
    await expect(footer).toContainText(copyright);
  }
});
