import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import Mermaid from "@/components/Mermaid.astro";

type Props = {
  chart: string;
  caption?: string;
  id?: string;
};

const renderDiagram = async (props: Props) => {
  const container = await AstroContainer.create();
  return container.renderToString(Mermaid, { props });
};

describe("Mermaid", () => {
  it("renders Pele's SVG at build time", async () => {
    const html = await renderDiagram({ chart: "flowchart LR\n  A --> B" });

    expect(html).toContain("<svg");
    expect(html).toContain('class="pele pele-flowchart"');
    expect(html).not.toContain("<script");
  });

  it("colors the SVG through CSS variables so themes switch without a re-render", async () => {
    const html = await renderDiagram({ chart: "flowchart LR\n  A --> B" });

    expect(html).toContain("var(--pele-fg");
    expect(html).toContain("var(--pele-bg");
  });

  it("renders the caption and uses it as the figure label", async () => {
    const html = await renderDiagram({
      chart: "flowchart LR\n  A --> B",
      caption: "A retry flow",
    });

    expect(html).toContain('<figcaption class="label mt-2">A retry flow</figcaption>');
    expect(html).toContain('aria-label="A retry flow"');
  });

  it("fails the build when the diagram cannot be rendered", async () => {
    await expect(renderDiagram({ chart: "flowchart TD\n  A -->" })).rejects.toThrow(
      /Could not render a Mermaid diagram/,
    );
  });
});
