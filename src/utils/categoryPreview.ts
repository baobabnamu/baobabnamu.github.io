// Category nav teaser: a few categories plus a control for the rest.
export const CATEGORY_PREVIEW_LIMIT = 3;

export const previewCategories = <T>(categories: T[]): T[] =>
  categories.slice(0, CATEGORY_PREVIEW_LIMIT);

export const hiddenCategoryCount = (total: number): number =>
  Math.max(total - CATEGORY_PREVIEW_LIMIT, 0);
