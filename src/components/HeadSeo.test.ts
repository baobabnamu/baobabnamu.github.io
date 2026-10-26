import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import HeadSeo, { type Props } from "@/components/HeadSeo.astro";

const renderHeadSeo = async (props: Props, url = "http://localhost:4321/posts/") => {
  const container = await AstroContainer.create();
  return container.renderToString(HeadSeo, {
    props,
    request: new Request(url),
  });
};

const defaultProps: Props = {
  title: "Posts",
  description: "A list of posts.",
  siteName: "Print",
  siteDescription: "A minimal Astro site.",
};

describe("HeadSeo", () => {
  it("formats title with site name when not identical", async () => {
    const html = await renderHeadSeo(defaultProps);
    expect(html).toContain("<title>Posts · Print</title>");
    expect(html).toContain('<meta property="og:title" content="Posts · Print"');
    expect(html).toContain('<meta name="twitter:title" content="Posts · Print"');
  });

  it("keeps title unchanged when it matches site name", async () => {
    const html = await renderHeadSeo(
      { ...defaultProps, title: "Print" },
      "http://localhost:4321/",
    );
    expect(html).toContain("<title>Print</title>");
    expect(html).toContain('<meta property="og:title" content="Print"');
  });

  it("defaults siteName and description from site config if not provided", async () => {
    const html = await renderHeadSeo({
      title: "About",
    });
    expect(html).toContain("<title>About · Bao의 기술 블로그</title>");
    expect(html).toContain('<meta property="og:site_name" content="Bao의 기술 블로그"');
    // Description should fall back to the site config value, not be empty
    expect(html).toMatch(/<meta name="description" content=".+"/);
  });

  it("renders mobile-optimized viewport and theme colors", async () => {
    const html = await renderHeadSeo(defaultProps);
    expect(html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"',
    );
    expect(html).toContain(
      '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f7f6f2"',
    );
    expect(html).toContain(
      '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#161615"',
    );
  });

  it("renders canonical URL and sitemap links", async () => {
    const html = await renderHeadSeo(defaultProps);
    expect(html).toContain('<link rel="canonical" href="http://localhost:4321/posts/"');
    expect(html).toContain('<link rel="sitemap" href="/sitemap-index.xml"');
  });

  it("renders no language alternate links — this site is Korean-only", async () => {
    const html = await renderHeadSeo(defaultProps);
    expect(html).not.toContain('rel="alternate"');
    expect(html).not.toContain('property="og:locale:alternate"');
  });

  it("renders OpenGraph and Twitter card metadata with default og image", async () => {
    const html = await renderHeadSeo({
      ...defaultProps,
      type: "article",
    });
    expect(html).toContain('<meta property="og:site_name" content="Print"');
    expect(html).toContain('<meta property="og:type" content="article"');
    expect(html).toContain('<meta property="og:locale" content="ko"');
    expect(html).toContain('<meta property="og:image" content="http://localhost:4321/og.jpg"');
    expect(html).toContain('<meta property="og:image:width" content="1200"');
    expect(html).toContain('<meta property="og:image:height" content="630"');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image"');
    expect(html).toContain('<meta name="twitter:image" content="http://localhost:4321/og.jpg"');
  });

  it("renders image metadata when image prop is provided", async () => {
    const html = await renderHeadSeo({
      ...defaultProps,
      image: {
        src: "/images/cover.jpg",
        alt: "Post cover",
        width: 1200,
        height: 630,
      },
    });
    expect(html).toContain(
      '<meta property="og:image" content="http://localhost:4321/images/cover.jpg"',
    );
    expect(html).toContain('<meta property="og:image:alt" content="Post cover"');
    expect(html).toContain('<meta property="og:image:width" content="1200"');
    expect(html).toContain('<meta property="og:image:height" content="630"');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image"');
    expect(html).toContain(
      '<meta name="twitter:image" content="http://localhost:4321/images/cover.jpg"',
    );
  });

  it("renders robots noindex when noindex is true", async () => {
    const html = await renderHeadSeo({
      ...defaultProps,
      noindex: true,
    });
    expect(html).toContain('<meta name="robots" content="noindex, nofollow"');
  });
});
