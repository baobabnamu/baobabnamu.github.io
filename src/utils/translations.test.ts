import { describe, expect, it } from "vitest";
import { hasTranslation } from "@/utils/translations";

describe("hasTranslation", () => {
  it("treats static pages as available in the (only) language", () => {
    for (const path of ["/", "/about", "/posts"]) {
      expect(hasTranslation(path, "ko")).toBe(true);
    }
  });

  it("follows which posts actually exist", () => {
    expect(hasTranslation("/posts/os-performance-bottleneck-diagnosis", "ko")).toBe(true);
    expect(hasTranslation("/posts/os-performance-bottleneck-diagnosis/", "ko")).toBe(true);
    expect(hasTranslation("/posts/does-not-exist/", "ko")).toBe(false);
  });

  it("follows which categories actually exist", () => {
    expect(hasTranslation("/posts/categories/infra/", "ko")).toBe(true);
    expect(hasTranslation("/posts/categories/does-not-exist/", "ko")).toBe(false);
  });

  it("assumes unknown paths exist rather than crossing out the only language", () => {
    expect(hasTranslation("/some/future/page/", "ko")).toBe(true);
  });
});
