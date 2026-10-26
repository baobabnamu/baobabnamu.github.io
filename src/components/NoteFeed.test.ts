import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import NoteFeed from "@/components/NoteFeed.astro";

type Note = {
  id: string;
  data: { headline: string; publishDate: Date; category: string };
};

const renderFeed = async (notes: Note[], currentSlug: string) => {
  const container = await AstroContainer.create();
  return container.renderToString(NoteFeed, { props: { notes, currentSlug } });
};

const notes: Note[] = [
  {
    id: "ko/alpha",
    data: { headline: "Alpha", publishDate: new Date("2024-01-02T00:00:00Z"), category: "infra" },
  },
  {
    id: "ko/beta",
    data: { headline: "Beta", publishDate: new Date("2024-01-03T00:00:00Z"), category: "infra" },
  },
];

describe("NoteFeed", () => {
  it("renders one link per note, in order, with no language segment in the URL", async () => {
    const html = await renderFeed(notes, "ko/alpha");

    expect(html.match(/<a\b/g)).toHaveLength(2);
    expect(html).toContain('href="/notes/alpha/#note-alpha"');
    expect(html).toContain('href="/notes/beta/#note-beta"');
    expect(html).toContain('id="note-alpha"');
    expect(html).toContain('id="note-beta"');
    expect(html.indexOf("Alpha")).toBeLessThan(html.indexOf("Beta"));
  });

  it("keeps the current note's accessible name plain", async () => {
    const html = await renderFeed(notes, "ko/alpha");

    const current = html.match(/<a\b[^>]*href="\/notes\/alpha\/#note-alpha"[^>]*>/)?.[0];
    // The selection brackets are decorative, so the accessible name stays plain.
    expect(current).toContain('aria-label="Alpha"');

    const other = html.match(/<a\b[^>]*href="\/notes\/beta\/#note-beta"[^>]*>/)?.[0];
    expect(other).not.toContain("aria-label");
  });

  it("marks nothing when no note is current", async () => {
    const html = await renderFeed(notes, "ko/gamma");

    const link = html.match(/<a\b[^>]*href="\/notes\/alpha\/#note-alpha"[^>]*>/)?.[0];
    expect(link).not.toContain("aria-label");
  });
});
