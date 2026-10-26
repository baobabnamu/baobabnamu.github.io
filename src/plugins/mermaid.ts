import { defineMdastPlugin } from "satteri";

/**
 * Turn ```mermaid fences into `<Mermaid chart="…">` elements.
 *
 * Sätteri is Astro's default Markdown processor, and MDX inherits its plugins
 * from `markdown.processor`, so the same plugin covers every `.mdx` entry. The
 * page that renders the entry supplies the component:
 *
 *   <Content components={{ Mermaid }} />
 *
 * `src/components/Mermaid.astro` then renders the SVG at build time with Pele.
 */
export default defineMdastPlugin({
  name: "mermaid",
  // Used below to give every diagram on a page a unique SVG id prefix.
  options: { position: true },
  code(node, ctx) {
    // Markdown has no JSX, so `.md` files keep a plain code block.
    if (node.lang !== "mermaid" || ctx.sourceFormat !== "mdx") return;

    const attributes = [{ type: "mdxJsxAttribute" as const, name: "chart", value: node.value }];

    // The fence meta becomes a caption: ```mermaid A retry flow
    if (node.meta) {
      attributes.push({
        type: "mdxJsxAttribute" as const,
        name: "caption",
        value: node.meta,
      });
    }

    // Pele requires unique SVG ids per page. A fence position is stable between
    // builds and unique among the diagrams in one document.
    const line = node.position?.start.line ?? 0;
    const column = node.position?.start.column ?? 0;
    attributes.push({
      type: "mdxJsxAttribute" as const,
      name: "id",
      value: `mermaid-${line}-${column}`,
    });

    ctx.replaceNode(node, {
      type: "mdxJsxFlowElement",
      name: "Mermaid",
      attributes,
      children: [],
    });
  },
});
