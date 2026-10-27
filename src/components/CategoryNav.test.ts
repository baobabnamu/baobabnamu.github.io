import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import CategoryNav from "@/components/CategoryNav.astro";

const renderNav = async (categories: string[], active?: string) => {
  const container = await AstroContainer.create();
  return container.renderToString(CategoryNav, { props: { categories, lang: "ko", active } });
};

describe("CategoryNav", () => {
  it("renders a nav landmark labelled after the categories title", async () => {
    const html = await renderNav(["CSS"]);

    expect(html).toMatch(/<nav\b[^>]*aria-label="Category"/);
  });

  it("renders one link per category, each pointing at its own page", async () => {
    const html = await renderNav(["CSS", "Functional Programming"]);

    expect(html).toContain('href="/posts/categories/css/"');
    expect(html).toContain('href="/posts/categories/functional-programming/"');

    const positions = ["CSS", "Functional Programming"].map((name) => html.indexOf(name));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("marks the active category as the current page", async () => {
    const html = await renderNav(["CSS", "Astro"], "CSS");

    const currentLink = html.match(/<a\b[^>]*aria-current="page"[^>]*>/)?.[0];
    expect(currentLink).toBeDefined();
    expect(currentLink).toContain('href="/posts/categories/css/"');
    // The selection brackets are decorative, so the accessible name stays plain.
    expect(currentLink).toContain('aria-label="CSS"');
  });

  it("marks nothing as current when no category is active", async () => {
    const html = await renderNav(["CSS", "Astro"]);

    expect(html).not.toContain("aria-current");
  });

  it("shows a short preview with a collapsed disclosure for the rest", async () => {
    const html = await renderNav(["AI", "Astro", "CSS", "Go", "Vue"]);

    // No `open` attribute: starts collapsed.
    const detailsTag = html.match(/<details\b[^>]*>/)?.[0];
    expect(detailsTag).toBeDefined();
    expect(detailsTag).not.toContain("open");

    // Summary states the hidden count.
    const summary = html.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/)?.[1] ?? "";
    expect(summary).toContain("2 more");
  });

  it("keeps the preview categories out of the disclosure and the rest inside", async () => {
    const html = await renderNav(["AI", "Astro", "CSS", "Go", "Vue"]);
    const details = html.match(/<details\b[\s\S]*<\/details>/)?.[0] ?? "";

    expect(details).not.toContain('href="/posts/categories/ai/"');
    expect(details).toContain('href="/posts/categories/go/"');
    expect(details).toContain('href="/posts/categories/vue/"');
  });

  it("omits the disclosure when every category fits in the preview", async () => {
    const html = await renderNav(["AI", "Astro", "CSS"]);

    expect(html).not.toContain("<details");
    expect(html).toContain('href="/posts/categories/css/"');
  });
});
