import { describe, expect, it } from "vitest";
import { GET } from "@/pages/robots.txt";

describe("robots.txt", () => {
  const render = async (site?: URL) => (await GET({ site } as any)).text();

  it("points crawlers at the deployment's sitemap index", async () => {
    const site = new URL("https://print.example.com/");
    expect(await render(site)).toBe(
      "User-agent: *\nAllow: /\n\nSitemap: https://print.example.com/sitemap-index.xml\n",
    );
  });

  it("uses the deployment root when the site has no base path", async () => {
    expect(await render(new URL("https://example.com/"))).toContain(
      "Sitemap: https://example.com/sitemap-index.xml\n",
    );
  });

  it("omits the Sitemap line when no site is configured (development)", async () => {
    expect(await render(undefined)).toBe("User-agent: *\nAllow: /\n");
  });
});
