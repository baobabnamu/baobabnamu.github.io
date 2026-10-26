import { describe, expect, it } from "vitest";
import { hiddenPostCount, previewPosts } from "@/utils/postPreview";

describe("previewPosts", () => {
  it("returns the first three posts", () => {
    expect(previewPosts(["a", "b", "c", "d", "e"])).toEqual(["a", "b", "c"]);
  });

  it("returns everything when there are three or fewer", () => {
    expect(previewPosts(["a", "b", "c"])).toEqual(["a", "b", "c"]);
    expect(previewPosts(["a"])).toEqual(["a"]);
    expect(previewPosts([])).toEqual([]);
  });
});

describe("hiddenPostCount", () => {
  it("hides nothing at or under the limit", () => {
    expect(hiddenPostCount(3)).toBe(0);
    expect(hiddenPostCount(1)).toBe(0);
    expect(hiddenPostCount(0)).toBe(0);
  });

  it("counts the posts beyond the limit", () => {
    expect(hiddenPostCount(4)).toBe(1);
    expect(hiddenPostCount(10)).toBe(7);
  });
});
