import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import AppFooter from "@/components/AppFooter.astro";

type Props = {
  copyright: string;
  socials: { name: string; url: string }[];
  linksLabel: string;
};

const renderFooter = async (props: Props) => {
  const container = await AstroContainer.create();
  return container.renderToString(AppFooter, { props });
};

describe("AppFooter", () => {
  it("renders a footer landmark with the copyright line", async () => {
    const html = await renderFooter({
      copyright: "© 2026 Print",
      socials: [],
      linksLabel: "connect:",
    });

    expect(html).toMatch(/^<footer\b/);
    expect(html).toMatch(/<\/footer>$/);
    expect(html).toContain("© 2026 Print");
  });

  it("links to every social in the given order", async () => {
    const socials = [
      { name: "GitHub", url: "https://github.com/withastro" },
      { name: "X", url: "https://x.com/astrodotbuild" },
    ];

    const html = await renderFooter({
      copyright: "© 2026 Print",
      socials,
      linksLabel: "connect:",
    });

    for (const { name, url } of socials) {
      expect(html).toContain(`href="${url}"`);
      expect(html).toContain(`>${name}</a>`);
    }

    const positions = socials.map((social) => html.indexOf(social.name));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("renders the socials label", async () => {
    const html = await renderFooter({
      copyright: "© 2026 Print",
      socials: [{ name: "GitHub", url: "https://github.com/withastro" }],
      linksLabel: "聯繫：",
    });

    expect(html).toContain("聯繫：");
  });

  it("renders no links when the site has no socials", async () => {
    const html = await renderFooter({
      copyright: "© 2026 Print",
      socials: [],
      linksLabel: "connect:",
    });

    expect(html).not.toContain("<a ");
  });
});
