import { describe, expect, it } from "vitest";
import { resolveBase, stripBase, withBase } from "@/utils/base";

describe("resolveBase", () => {
  it("falls back to the domain root when no base is configured", () => {
    expect(resolveBase(undefined)).toBe("/");
    expect(resolveBase("")).toBe("/");
    expect(resolveBase("/")).toBe("/");
  });

  it("normalizes a bare path segment to a single-slash base", () => {
    expect(resolveBase("print")).toBe("/print/");
    expect(resolveBase("/print")).toBe("/print/");
    expect(resolveBase("print/")).toBe("/print/");
    expect(resolveBase("/print/")).toBe("/print/");
  });

  it("accepts a full deployment URL and keeps only its path", () => {
    expect(resolveBase("https://example.com/print")).toBe("/print/");
    expect(resolveBase("https://example.com/")).toBe("/");
  });

  it("preserves a nested base", () => {
    expect(resolveBase("apps/print")).toBe("/apps/print/");
  });
});

describe("withBase", () => {
  it("leaves paths untouched when the site is served from the root", () => {
    expect(withBase("/en/posts/", "/")).toBe("/en/posts/");
    expect(withBase("/", "/")).toBe("/");
  });

  it("prefixes root-relative paths with the base", () => {
    expect(withBase("/en/posts/", "/print/")).toBe("/print/en/posts/");
    expect(withBase("/", "/print/")).toBe("/print/");
  });

  it("normalizes the base before joining", () => {
    expect(withBase("/favicon.svg", "print")).toBe("/print/favicon.svg");
  });

  it("tolerates paths without a leading slash", () => {
    expect(withBase("en/posts/", "/print/")).toBe("/print/en/posts/");
  });
});

describe("stripBase", () => {
  it("returns the path unchanged when the site is served from the root", () => {
    expect(stripBase("/en/posts/", "/")).toBe("/en/posts/");
  });

  it("removes the base prefix so route parsing sees the app path", () => {
    expect(stripBase("/print/en/posts/", "/print/")).toBe("/en/posts/");
    expect(stripBase("/print/", "/print/")).toBe("/");
  });

  it("leaves paths outside the base alone", () => {
    expect(stripBase("/en/posts/", "/print/")).toBe("/en/posts/");
  });
});
