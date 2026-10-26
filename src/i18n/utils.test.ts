import { describe, expect, it, vi } from "vitest";
import {
  getLangFromId,
  getLangFromUrl,
  getPathFromUrl,
  getSlugFromId,
  isLanguageKey,
  useTranslatedPath,
  useTranslations,
} from "@/i18n/utils";

const url = (path: string) => new URL(`https://example.com${path}`);

describe("isLanguageKey", () => {
  it("accepts the supported language and rejects anything else", () => {
    expect(isLanguageKey("ko")).toBe(true);
    expect(isLanguageKey("en")).toBe(false);
    expect(isLanguageKey(undefined)).toBe(false);
  });
});

describe("getLangFromId", () => {
  it("reads the language prefix from a language-scoped content id", () => {
    expect(getLangFromId("ko/why-pure-function")).toBe("ko");
  });

  it("returns undefined when the id has no supported language prefix", () => {
    expect(getLangFromId("why-pure-function")).toBeUndefined();
    expect(getLangFromId("en/why-pure-function")).toBeUndefined();
  });
});

describe("getSlugFromId", () => {
  it("removes the language prefix so the id can be used as a slug", () => {
    expect(getSlugFromId("ko/why-pure-function")).toBe("why-pure-function");
  });

  it("leaves ids without a language prefix untouched", () => {
    expect(getSlugFromId("why-pure-function")).toBe("why-pure-function");
  });
});

describe("getLangFromUrl", () => {
  it("falls back to the default (only) language for every path", () => {
    // This site has no `/ko/` URL segment — every real route's first
    // segment is a route name ("posts", "notes", …), never a language.
    expect(getLangFromUrl(url("/posts/"))).toBe("ko");
    expect(getLangFromUrl(url("/"))).toBe("ko");
  });
});

describe("getPathFromUrl", () => {
  it("returns the path unchanged — there is no language segment to strip", () => {
    expect(getPathFromUrl(url("/posts/"))).toBe("/posts/");
    expect(getPathFromUrl(url("/posts"))).toBe("/posts");
  });

  it("returns the root path for the root URL", () => {
    expect(getPathFromUrl(url("/"))).toBe("/");
  });
});

describe("useTranslations", () => {
  it("returns the Korean string for a known key", () => {
    expect(useTranslations("ko")("nav.home")).toBe("홈");
  });

  it("falls back to the key when it is absent from the dictionary", () => {
    expect(useTranslations("ko")("nope.not.a.key" as never)).toBe("nope.not.a.key");
  });

  it("replaces {name} placeholders with the supplied params", () => {
    expect(useTranslations("ko")("home.more", { count: 3 })).toBe("… 3개 더");
    expect(useTranslations("ko")("posts.count", { count: 2 })).toBe("2개");
  });
});

describe("useTranslatedPath", () => {
  it("does not add a language segment — this site is Korean-only", () => {
    expect(useTranslatedPath("ko")("/posts")).toBe("/posts");
  });

  it("keeps the root path as-is", () => {
    expect(useTranslatedPath("ko")("/")).toBe("/");
  });
});

describe("with a configured deployment base", () => {
  it("prefixes outgoing links and parses incoming URLs without it", async () => {
    vi.stubEnv("PUBLIC_BASE_URL", "print");
    vi.resetModules();

    const i18n = await import("@/i18n/utils");

    // Outgoing links carry the base, but no language segment.
    expect(i18n.useTranslatedPath("ko")("/posts")).toBe("/print/posts");
    expect(i18n.useTranslatedPath("ko")("/")).toBe("/print/");
    // Incoming URLs are parsed as if the base were not there.
    expect(i18n.getLangFromUrl(new URL("https://example.com/print/posts/"))).toBe("ko");
    expect(i18n.getPathFromUrl(new URL("https://example.com/print/posts/"))).toBe("/posts/");

    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
