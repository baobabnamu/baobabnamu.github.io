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

Posts are authored in Notion, not in this repo. The **Posts** database inside
the Notion `Blog` page is the source of truth; `scripts/notion-sync.mjs`
converts each page with `status: Published` into
`src/content/post/ko/<slug>/index.md` and a scheduled GitHub Actions workflow
(`.github/workflows/notion-sync.yml`) commits the result. **Don't hand-edit
`src/content/post/**/index.md` — it's a generated artifact and will be
overwritten on the next sync.**

The Notion `Blog` page documents the property→frontmatter mapping and which
blocks to use so the output matches the site's formatting (heading levels,
bold/code/quote/table conventions, footnotes as trailing toggle blocks named
`[^key]`). `templates/post/index.md` and
`src/content/post/ko/os-performance-bottleneck-diagnosis/index.md` still show
the resulting formatting skeleton if you need to read or debug the generated
Markdown, but new posts start from the Notion **Post Template** page, not
from this repo.
