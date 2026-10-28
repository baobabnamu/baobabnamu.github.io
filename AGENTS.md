## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Writing posts

Every post uses the same **formatting** (heading levels, block styles), whatever
the topic. Content, section count, and section names are free. The formatting
skeleton lives in `templates/post/index.md`; the reference post is
`src/content/post/ko/os-performance-bottleneck-diagnosis/index.md`.

- **Start from the template.** Copy `templates/post/index.md` to
  `drafts/<slug>/index.md` (or `src/content/post/ko/<slug>/index.md` when
  publishing) and fill it in.
- **Headings**
  - Never use `#` in the body — the page title (h1) comes from `headline`.
  - Top-level sections are `##`. An intro section is optional; if present, it
    and `## 마무리` are unnumbered. The ones in between are numbered:
    `## 1. 제목 — 부제`.
  - Sub-sections are `###`, either numbered after their parent
    (`### 3-1. 제목 — 부제`) or unnumbered (`### 제목`).
  - Don't go deeper than `###` — `.prose` only styles h2/h3.
- **Inline**
  - Bold only the one key sentence of a section, plus list labels
    (`- **라벨**: 내용`, `1. **항목.** 설명`).
  - Commands, config keys, values, file names, and log strings go in
    `` `inline code` ``.
- **Blocks**
  - Every fenced code block has a language tag. Diagrams (ASCII) and command
    output use `text`; commands use `bash`; config uses its own language
    (`yaml`, `ini`, ...).
  - A command and its output are separate blocks, followed by prose
    interpreting it.
  - Comparisons and summaries are Markdown tables.
  - Principles and caveats are blockquotes starting with `원칙:` or `주의:`.
- **Ending**: `## 마무리` (bullets), optionally `### 예상 질문` with items as
  `- **Q. ...?**` and the answer on the next line; then a `---` rule, a bold
  `**참고자료**` line (not a heading), and `- [제목](URL) —` entries saying what
  was taken from each source.
- **Footnotes**: don't add any by default. Add a footnote (`[^key]`) only for a
  term the user explicitly asked about, explaining it for a non-specialist.
- Before publishing, no `{{...}}` placeholders or template `<!-- -->` comments
  may remain, and `isDraft` is set to `false`.
