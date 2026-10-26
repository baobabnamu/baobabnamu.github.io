import { describe, expect, it } from "vitest";
import { hiddenCategoryCount, previewCategories } from "@/utils/categoryPreview";

describe("previewCategories", () => {
  it("returns the first three categories", () => {
    expect(previewCategories(["AI", "Astro", "CSS", "Go", "Vue"])).toEqual(["AI", "Astro", "CSS"]);
  });

  it("returns everything when there are three or fewer", () => {
    expect(previewCategories(["AI", "Astro", "CSS"])).toEqual(["AI", "Astro", "CSS"]);
    expect(previewCategories(["AI"])).toEqual(["AI"]);
    expect(previewCategories([])).toEqual([]);
  });
});

describe("hiddenCategoryCount", () => {
  it("hides nothing at or under the limit", () => {
    expect(hiddenCategoryCount(3)).toBe(0);
    expect(hiddenCategoryCount(1)).toBe(0);
    expect(hiddenCategoryCount(0)).toBe(0);
  });

  it("counts the categories beyond the limit", () => {
    expect(hiddenCategoryCount(4)).toBe(1);
    expect(hiddenCategoryCount(32)).toBe(29);
  });
});
