// Category names are written for humans ("Express.js", "Functional
// Programming"), so they need a URL-safe form before they can be used as a
// path segment: lowercase, punctuation collapsed into single dashes, and any
// dangling dashes trimmed off.
export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
