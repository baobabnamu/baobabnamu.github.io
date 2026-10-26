import { expect, test } from "@playwright/test";

// No notes exist yet — this just confirms the (empty) notes index still
// renders cleanly rather than erroring on a zero-length collection.
test("the notes index renders with zero entries", async ({ page }) => {
  await page.goto("/notes/");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("메모");
  await expect(page.getByText("0개")).toBeVisible();
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(0);
});
