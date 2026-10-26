import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import AppNavbar from "@/components/AppNavbar.astro";

type NavigationItem = { name: string; url: string; path: string };

const renderNavbar = async (navigation: NavigationItem[], path = "/") => {
  const container = await AstroContainer.create();
  return container.renderToString(AppNavbar, { props: { navigation, path } });
};

describe("AppNavbar", () => {
  it("renders a nav landmark wrapping the navigation", async () => {
    const html = await renderNavbar([{ name: "Alpha", url: "/alpha", path: "/alpha" }]);

    expect(html).toMatch(/^<nav\b/);
    expect(html).toMatch(/<\/nav>$/);
  });

  it("renders one link per item, in the given order", async () => {
    const navigation: NavigationItem[] = [
      { name: "Alpha", url: "/alpha", path: "/alpha" },
      { name: "Beta", url: "/beta", path: "/beta" },
      { name: "Gamma", url: "/gamma", path: "/gamma" },
    ];

    const html = await renderNavbar(navigation);

    for (const { name, url } of navigation) {
      expect(html).toContain(`href="${url}"`);
      expect(html).toContain(`>${name}</a>`);
    }

    const positions = navigation.map((item) => html.indexOf(item.name));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("renders an empty nav for an empty navigation list", async () => {
    const html = await renderNavbar([]);

    expect(html).not.toContain("<a ");
  });

  it("marks the link whose path matches the current page as current", async () => {
    const navigation: NavigationItem[] = [
      { name: "Home", url: "/en/", path: "/" },
      { name: "Posts", url: "/en/posts", path: "/posts" },
      { name: "About", url: "/en/about", path: "/about" },
    ];

    const html = await renderNavbar(navigation, "/posts");

    const current = html.match(/<a\b[^>]*aria-current="page"[^>]*>/)?.[0];
    expect(current).toBeDefined();
    expect(current).toContain('href="/en/posts"');
    // The selection brackets are decorative, so the accessible name stays plain.
    expect(current).toContain('aria-label="Posts"');

    const home = html.match(/<a\b[^>]*href="\/en\/"[^>]*>/)?.[0];
    expect(home).toBeDefined();
    expect(home).not.toContain("aria-current");
  });

  it("marks a nested page as active for its section", async () => {
    const navigation: NavigationItem[] = [
      { name: "Home", url: "/en/", path: "/" },
      { name: "Posts", url: "/en/posts", path: "/posts" },
    ];

    const html = await renderNavbar(navigation, "/posts/categories/css");

    const current = html.match(/<a\b[^>]*aria-current="page"[^>]*>/)?.[0];
    expect(current).toBeDefined();
    expect(current).toContain('href="/en/posts"');

    const home = html.match(/<a\b[^>]*href="\/en\/"[^>]*>/)?.[0];
    expect(home).not.toContain("aria-current");
  });

  it("marks nothing as current on an unrelated page", async () => {
    const navigation: NavigationItem[] = [
      { name: "Home", url: "/en/", path: "/" },
      { name: "Posts", url: "/en/posts", path: "/posts" },
    ];

    const html = await renderNavbar(navigation, "/about");

    expect(html).not.toContain("aria-current");
  });
});
