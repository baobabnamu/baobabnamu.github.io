import { describe, expect, it } from "vitest";
import type { TranslationKey } from "@/i18n/ui";
import { buildNav, isPathActive } from "@/utils/nav";

const labels = { "nav.home": "Home", "nav.posts": "Posts" } satisfies Partial<
  Record<TranslationKey, string>
>;

const t = (key: TranslationKey) => labels[key as keyof typeof labels] ?? key;
const translatePath = (path: string) => `/en${path}`;

describe("buildNav", () => {
  it("translates each label, localizes each url, and keeps the path, preserving order", () => {
    const nav = buildNav(
      [
        { translationKey: "nav.home", url: "/" },
        { translationKey: "nav.posts", url: "/posts", hideOnMobile: true },
      ],
      t,
      translatePath,
    );

    expect(nav).toEqual([
      { name: "Home", url: "/en/", path: "/" },
        { name: "Posts", url: "/en/posts", path: "/posts", hideOnMobile: true },
    ]);
  });

  it("returns an empty list for empty navigation", () => {
    expect(buildNav([], t, translatePath)).toEqual([]);
  });
});

describe("isPathActive", () => {
  it("matches the current path exactly", () => {
    expect(isPathActive("/posts", "/posts")).toBe(true);
  });

  it("matches a page nested under the target path", () => {
    expect(isPathActive("/posts/hello-world", "/posts")).toBe(true);
    expect(isPathActive("/posts/categories/css", "/posts")).toBe(true);
  });

  it("ignores a sibling path that merely shares a prefix", () => {
    expect(isPathActive("/posts-archive", "/posts")).toBe(false);
    expect(isPathActive("/notes", "/posts")).toBe(false);
  });

  it("marks the root active only on the root", () => {
    expect(isPathActive("/", "/")).toBe(true);
    expect(isPathActive("/posts", "/")).toBe(false);
  });

  it("ignores trailing slashes when comparing", () => {
    expect(isPathActive("/posts/", "/posts")).toBe(true);
    expect(isPathActive("/posts", "/posts/")).toBe(true);
  });
});
