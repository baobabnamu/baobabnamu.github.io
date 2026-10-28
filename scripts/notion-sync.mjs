#!/usr/bin/env node
// Syncs the Notion "Posts" data source into src/content/post/ko/<slug>/index.md.
// Notion is the authoring source; these .md files are a generated artifact —
// see AGENTS.md and the Notion "Blog" page for the property/block mapping rules.

import { Client } from "@notionhq/client";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_SOURCE_ID =
  process.env.NOTION_POSTS_DATA_SOURCE_ID ?? "d7eb8e04-c2e1-4bd4-abf0-69f74da94079";
const POSTS_DIR = path.join(process.cwd(), "src/content/post/ko");
const CATEGORIES = new Set(["OPS", "DEV", "AI"]);
// Not committed to the repo — the workflow restores/saves this via GitHub
// Actions cache, which is best-effort. A cold cache just means this run falls
// back to scanning every page, so losing it is a performance hit, not a
// correctness issue.
const STATE_FILE = path.join(process.cwd(), ".cache/notion-sync-state.json");

const notion = new Client({ auth: requireEnv("NOTION_TOKEN") });

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function readState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function writeState(state) {
  await mkdir(path.dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state), "utf8");
}

async function queryAllPages(since) {
  const pages = [];
  let cursor;
  const filter = since
    ? { timestamp: "last_edited_time", last_edited_time: { on_or_after: since } }
    : undefined;
  do {
    const response = await notion.dataSources.query({
      data_source_id: DATA_SOURCE_ID,
      filter,
      start_cursor: cursor,
      page_size: 100,
    });
    pages.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);
  return pages;
}

async function listAllChildren(blockId) {
  const blocks = [];
  let cursor;
  do {
    const response = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });
    blocks.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

function plainText(richText) {
  return (richText ?? []).map((item) => item.plain_text).join("");
}

function getTitle(prop) {
  return prop?.type === "title" ? plainText(prop.title).trim() : "";
}

function getRichText(prop) {
  return prop?.type === "rich_text" ? plainText(prop.rich_text).trim() : "";
}

function getSelect(prop) {
  return prop?.type === "select" ? (prop.select?.name ?? "") : "";
}

function getStatus(prop) {
  return prop?.type === "status" ? (prop.status?.name ?? "") : "";
}

function getDate(prop) {
  return prop?.type === "date" ? (prop.date?.start ?? "") : "";
}

function toPageProperties(page) {
  const props = page.properties;
  return {
    headline: getTitle(props.headline),
    subHeadline: getRichText(props.subHeadline),
    excerpt: getRichText(props.excerpt),
    category: getSelect(props.category),
    status: getStatus(props.status),
    slug: getRichText(props.slug),
    publishDate: getDate(props.publishDate),
    lastModifiedDate: getDate(props.lastModifiedDate),
  };
}

function validate(props) {
  const problems = [];
  if (!props.headline) problems.push("headline이 비어 있음");
  if (!props.slug) problems.push("slug가 비어 있음");
  if (!props.excerpt) problems.push("excerpt가 비어 있음");
  if (!props.subHeadline) problems.push("subHeadline이 비어 있음");
  if (!CATEGORIES.has(props.category))
    problems.push(`category가 올바르지 않음: "${props.category}"`);
  if (!props.publishDate) problems.push("publishDate가 비어 있음");
  if (problems.length > 0) throw new Error(problems.join(", "));
}

function yamlString(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function buildFrontmatter(props) {
  const lines = [
    "---",
    `isDraft: ${props.status !== "Published"}`,
    `headline: ${yamlString(props.headline)}`,
    `subHeadline: ${yamlString(props.subHeadline)}`,
    `excerpt: ${yamlString(props.excerpt)}`,
    `category: "${props.category}"`,
    `publishDate: ${props.publishDate}`,
  ];
  if (props.lastModifiedDate) lines.push(`lastModifiedDate: ${props.lastModifiedDate}`);
  lines.push("---");
  return lines.join("\n");
}

function mapCodeLanguage(language) {
  if (!language) return "text";
  const normalized = language.toLowerCase();
  return normalized === "plain text" ? "text" : normalized;
}

// Notion splits one visually-bold run into several rich-text items whenever a
// code span or link sits inside it (one item per distinct annotation set).
// Wrapping each item in its own "**...**" would butt two bold markers against
// each other (e.g. "**foo****bar**"), which most Markdown parsers don't treat
// as a single run. Instead, track whether a bold span is open and only emit
// "**" at its start/end, regardless of how many items it spans.
function renderInline(richText) {
  let out = "";
  let boldOpen = false;
  for (const item of richText ?? []) {
    if (item.annotations.bold !== boldOpen) {
      out += "**";
      boldOpen = item.annotations.bold;
    }
    let text = item.plain_text;
    if (item.annotations.code) text = `\`${text}\``;
    if (item.href) text = `[${text}](${item.href})`;
    out += text;
  }
  if (boldOpen) out += "**";
  return out.replace(/\n/g, " ");
}

function indent(markdown, prefix) {
  return markdown
    .split("\n")
    .map((line) => (line.length > 0 ? prefix + line : line))
    .join("\n");
}

function renderTable(children) {
  const rows = children
    .filter((child) => child.type === "table_row")
    .map((child) => child.table_row.cells.map((cell) => renderInline(cell).replace(/\|/g, "\\|")));
  if (rows.length === 0) return "";
  const [header, ...body] = rows;
  const separator = header.map(() => "---");
  const toLine = (cells) => `| ${cells.join(" | ")} |`;
  return [toLine(header), toLine(separator), ...body.map(toLine)].join("\n");
}

// Footnotes aren't representable as plain Markdown in Notion, so the authoring
// convention (documented on the Notion "Blog" page) stores each one as a
// top-level toggle block whose title is exactly "[^key]". These never render
// inline; they're collected here and emitted as trailing `[^key]: ...`
// footnote definitions instead. A toggle anywhere else (nested inside a
// footnote or a list item) is a plain progressive-disclosure fold and comes
// out as a raw <details><summary> block — Satteri passes raw HTML through
// untouched, and nesting falls out for free since each fold is just a
// normal element in the tree.
const FOOTNOTE_TOGGLE = /^\[\^([^\]]+)\]$/;

const LIST_ITEM_TYPES = new Set(["bulleted_list_item", "numbered_list_item"]);

async function renderBlocks(blocks, footnotes, isTopLevel = false) {
  // Markdown list items render as a "tight" list (no extra spacing) only when
  // they aren't separated by blank lines, so consecutive list-item blocks are
  // joined with a single newline; everything else keeps a blank line between.
  const parts = [];
  let numberedIndex = 0;

  for (const block of blocks) {
    numberedIndex = block.type === "numbered_list_item" ? numberedIndex + 1 : 0;

    const children = block.has_children ? await listAllChildren(block.id) : [];

    switch (block.type) {
      case "heading_2":
        parts.push(`## ${renderInline(block.heading_2.rich_text)}`);
        break;
      case "heading_3":
        parts.push(`### ${renderInline(block.heading_3.rich_text)}`);
        break;
      case "paragraph":
        parts.push(renderInline(block.paragraph.rich_text));
        break;
      case "quote":
        parts.push(
          renderInline(block.quote.rich_text)
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n"),
        );
        break;
      case "divider":
        parts.push("---");
        break;
      case "code": {
        const language = mapCodeLanguage(block.code.language);
        const content = plainText(block.code.rich_text);
        parts.push(`\`\`\`${language}\n${content}\n\`\`\``);
        break;
      }
      case "table": {
        parts.push(renderTable(children));
        break;
      }
      case "bulleted_list_item":
      case "numbered_list_item": {
        const marker = block.type === "numbered_list_item" ? `${numberedIndex}. ` : "- ";
        const text = renderInline(block[block.type].rich_text);
        const nested = await renderBlocks(children, footnotes);
        parts.push(nested ? `${marker}${text}\n${indent(nested, "  ")}` : `${marker}${text}`);
        break;
      }
      case "toggle": {
        const title = renderInline(block.toggle.rich_text).trim();
        if (isTopLevel) {
          const match = title.match(FOOTNOTE_TOGGLE);
          if (!match) {
            throw new Error(`최상위 토글은 각주([^key]) 전용인데 "${title}" 형태가 아님`);
          }
          footnotes.set(match[1], await renderBlocks(children, footnotes));
          continue;
        }
        const nested = await renderBlocks(children, footnotes);
        parts.push(`<details>\n<summary>${title}</summary>\n\n${nested}\n\n</details>`);
        break;
      }
      default:
        throw new Error(`지원하지 않는 블록 타입: ${block.type}`);
    }

    parts[parts.length - 1] = {
      text: parts[parts.length - 1],
      isListItem: LIST_ITEM_TYPES.has(block.type),
    };
  }

  let out = "";
  for (let i = 0; i < parts.length; i++) {
    const separator = i > 0 && parts[i].isListItem && parts[i - 1].isListItem ? "\n" : "\n\n";
    out += (i > 0 ? separator : "") + parts[i].text;
  }
  return out;
}

function renderFootnote(key, bodyMarkdown) {
  const [first = "", ...rest] = bodyMarkdown.split("\n");
  const continuation = rest.map((line) => (line.length > 0 ? `    ${line}` : line)).join("\n");
  return continuation ? `[^${key}]: ${first}\n${continuation}` : `[^${key}]: ${first}`;
}

async function convertPage(page) {
  const props = toPageProperties(page);
  validate(props);

  const footnotes = new Map();
  const topLevelBlocks = await listAllChildren(page.id);
  const body = await renderBlocks(topLevelBlocks, footnotes, true);

  const footnoteText = [...footnotes.entries()]
    .map(([key, markdown]) => renderFootnote(key, markdown))
    .join("\n");

  const markdown = [buildFrontmatter(props), "", body, footnoteText]
    .filter((part) => part.length > 0)
    .join("\n\n");

  return { slug: props.slug, markdown: `${markdown}\n` };
}

async function writeIfChanged(slug, markdown) {
  const dir = path.join(POSTS_DIR, slug);
  const file = path.join(dir, "index.md");

  const existing = await readFile(file, "utf8").catch((err) => {
    if (err.code === "ENOENT") return null;
    throw err;
  });
  if (existing === markdown) return false;

  await mkdir(dir, { recursive: true });
  await writeFile(file, markdown, "utf8");
  return true;
}

async function main() {
  // Captured before querying, so edits landing mid-run are still >= this
  // timestamp and get picked up by the next run's filter.
  const syncStartedAt = new Date().toISOString();
  const state = await readState();

  const pages = await queryAllPages(state?.lastSyncedAt);
  let changed = 0;

  for (const page of pages) {
    try {
      const { slug, markdown } = await convertPage(page);
      if (await writeIfChanged(slug, markdown)) {
        changed += 1;
        console.log(`[notion-sync] wrote ${slug}`);
      }
    } catch (err) {
      console.warn(`[notion-sync] skip page ${page.id}: ${err.message}`);
    }
  }

  await writeState({ lastSyncedAt: syncStartedAt });
  console.log(`[notion-sync] checked ${pages.length} page(s), ${changed} file(s) changed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
