import { markdownToJs, mdxToJs } from "satteri";
import { describe, expect, it } from "vitest";
import mermaid from "@/plugins/mermaid";

const compileMdx = (source: string) => mdxToJs(source, { mdastPlugins: [mermaid], jsx: true }).code;

describe("mermaid mdast plugin", () => {
  it("replaces a mermaid fence with a Mermaid element", () => {
    const code = compileMdx("```mermaid\nflowchart LR\n  A --> B\n```\n");

    expect(code).toContain("<Mermaid");
    expect(code).toContain("flowchart LR");
  });

  it("passes the fence meta as the caption", () => {
    const code = compileMdx("```mermaid A retry flow\nflowchart LR\n  A --> B\n```\n");

    expect(code).toContain('caption="A retry flow"');
  });

  it("gives each diagram a position-based id prefix", () => {
    const code = compileMdx(
      "```mermaid\nflowchart LR\n  A --> B\n```\n\n```mermaid\nflowchart LR\n  C --> D\n```\n",
    );

    expect(code).toContain('id="mermaid-1-1"');
    expect(code).toContain('id="mermaid-6-1"');
  });

  it("leaves other code fences alone", () => {
    const code = compileMdx("```ts\nconst answer = 42;\n```\n");

    expect(code).not.toContain("<Mermaid");
    expect(code).toContain("const answer = 42;");
  });

  it("does not emit JSX into the plain Markdown pipeline", () => {
    const code = markdownToJs("```mermaid\nA --> B\n```\n", {
      mdastPlugins: [mermaid],
    }).code;

    expect(code).not.toContain("Mermaid");
  });
});
