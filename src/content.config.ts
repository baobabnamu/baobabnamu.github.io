import { defineCollection } from "astro:content";
import { file, glob } from "astro/loaders";
import { z } from "astro/zod";

const socialSchema = z.object({
  name: z.string(),
  url: z.url(),
});

// Trimmed-down version of web-dong-blog's post schema. MVP only:
// no icon, no themeColor, no series.
const postSchema = z.object({
  isDraft: z.boolean().default(true),
  headline: z.string(),
  subHeadline: z.string(),
  excerpt: z.string(),
  category: z.string().default("unsorted"),
  publishDate: z.date(),
  lastModifiedDate: z.date().optional(),
});

// Navigation labels are translated: `translationKey` looks up the label in
// src/i18n/ui.ts, and `url` is a language-relative path (the language prefix
// is added when rendering).
const navigationItemSchema = z.object({
  translationKey: z.string(),
  url: z.string(),
  /** Hide this item below the desktop (`md`) breakpoint. */
  hideOnMobile: z.boolean().optional(),
});

// Site-wide configuration in src/data/config.json.
//
// The `file()` loader treats each top-level key as a collection entry `id`.
// Keeping a single `site` key makes this collection a singleton:
//
//   const config = await getEntry('config', 'site');
const config = defineCollection({
  loader: file("src/data/config.json"),
  schema: z.object({
    brand: z.object({
      name: z.string(),
      description: z.string(),
      copyright: z.string(),
      socials: z.array(socialSchema),
    }),
    navigation: z.array(navigationItemSchema),
  }),
});

// Turn "hello-world/index.md" into "hello-world".
const legacySlug = ({ entry }: { entry: string }) =>
  entry.replace(/\.[^/.]+$/, "").replace(/\/index$/, "");

export const collections = {
  config,
  post: defineCollection({
    loader: glob({
      pattern: "**/*.{md,mdx}",
      base: "./src/content/post",
      generateId: legacySlug,
    }),
    schema: postSchema,
  }),
};
