import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			// Transform string to Date object
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: z.optional(image()),
			// Single primary category for grouping/browsing (distinct from the
			// free-form multi-value `tags` below). Optional: posts without one
			// just don't appear on any /blog/category/<x>/ page.
			category: z.string().optional(),
			tags: z.array(z.string()).default([]),
			// Safety net: posts should normally never leave /drafts/ until
			// finished, but this lets an accidentally-committed post stay
			// out of the live site/RSS feed instead of forcing a revert.
			draft: z.boolean().default(false),
		}),
});

export const collections = { blog };
