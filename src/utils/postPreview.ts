// The home page shows a short teaser per category: the newest few posts plus a
// count of the rest.
export const POST_PREVIEW_LIMIT = 3;

export const previewPosts = <T>(posts: T[]): T[] => posts.slice(0, POST_PREVIEW_LIMIT);

export const hiddenPostCount = (total: number): number => Math.max(total - POST_PREVIEW_LIMIT, 0);
