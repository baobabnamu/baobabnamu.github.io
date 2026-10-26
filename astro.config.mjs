// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import astroExpressiveCode from "astro-expressive-code";
import { satteri } from "@astrojs/markdown-satteri";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import { resolveBase } from "./src/utils/base.ts";
import mermaid from "./src/plugins/mermaid.ts";

// The deployment sub-path, e.g. `/print/` for https://<owner>.github.io/print/.
// Unset locally, so development and the test suites run from the root.
const base = resolveBase(process.env.PUBLIC_BASE_URL);

/**
 * The absolute deployment URL the sitemap integration requires.
 *
 * `PUBLIC_SITE_URL` (set by the deploy workflow) provides it. A full
 * deployment-URL `PUBLIC_BASE_URL` (a custom domain) also works. When neither
 * carries a URL the build succeeds and sitemap generation is skipped.
 * @param {string | undefined} url
 * @returns {string | undefined}
 */
function resolveSite(url) {
  return typeof url === "string" && /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : undefined;
}
const site = resolveSite(process.env.PUBLIC_SITE_URL) ?? resolveSite(process.env.PUBLIC_BASE_URL);

// https://astro.build/config
export default defineConfig({
  base,
  site,
  markdown: {
    // MDX inherits this processor, so the mermaid plugin covers every entry.
    processor: satteri({ mdastPlugins: [mermaid] }),
  },
  integrations: [
    // Must come before `mdx()` so MDX pages pick up the code block rendering.
    // Syntax highlighting and annotations for every fenced code block in
    // Markdown/MDX. The processor above is Sätteri, which Expressive Code
    // detects and extends directly, so no remark/rehype wiring is needed.
    // Styling and theme options live in the auto-detected `ec.config.mjs` at
    // the project root; Expressive Code imports it during `astro:config:setup`,
    // so there is nothing to import here.
    astroExpressiveCode(),
    mdx(),
    // Generates `sitemap-index.xml` and `sitemap-0.xml` at build time from the
    // statically-generated routes. Requires `site` above.
    sitemap(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
