import { describe, expect, it } from "vitest";
import { slugify } from "@/utils/slug";

describe("slugify", () => {
  it("lowercases and joins words with dashes", () => {
    expect(slugify("Functional Programming")).toBe("functional-programming");
  });

  it("replaces punctuation runs with a single dash", () => {
    expect(slugify("Express.js")).toBe("express-js");
  });

  it("keeps existing dashes and digits", () => {
    expect(slugify("CI-CD")).toBe("ci-cd");
    expect(slugify("n8n")).toBe("n8n");
  });

  it("trims leading and trailing separators", () => {
    expect(slugify("  Web Performance  ")).toBe("web-performance");
    expect(slugify("...Draft...")).toBe("draft");
  });

  it("returns an empty string for separator-only input", () => {
    expect(slugify(" - ")).toBe("");
  });
});
