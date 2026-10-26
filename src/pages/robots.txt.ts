import type { APIRoute } from "astro";

/**
 * Dynamic robots.txt built from the configured `site`. Pointing crawlers at the
 * generated sitemap index here keeps the URL in sync with the deployment (the
 * GitHub Pages project site serves it under the base path). Without a `site`
 * config, e.g. in development, no Sitemap line is emitted.
 */
const getRobotsTxt = (sitemapURL?: URL) => {
  const lines = ["User-agent: *", "Allow: /"];
  if (sitemapURL) lines.push("", `Sitemap: ${sitemapURL.href}`);
  return lines.join("\n") + "\n";
};

export const GET: APIRoute = async ({ site }) =>
  new Response(getRobotsTxt(site ? new URL("sitemap-index.xml", site) : undefined));
