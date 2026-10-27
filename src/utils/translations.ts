import type { LanguageKey } from "@/i18n/ui";
import { getSlugFromId } from "@/i18n/utils";
import { normalizePath } from "@/utils/nav";
import { categoriesByLang, postsByLang } from "@/utils/posts";
import { slugify } from "@/utils/slug";

/**
 * The routes that exist in one language. Only content-driven routes can differ
 * between languages (a post or category may simply not be translated), so the
 * static pages are not listed here: they exist everywhere.
 */
interface LanguageRoutes {
  postSlugs: Set<string>;
  postCategorySlugs: Set<string>;
}

const routesCache = new Map<LanguageKey, LanguageRoutes>();

const getLanguageRoutes = (lang: LanguageKey): LanguageRoutes => {
  const cached = routesCache.get(lang);
  if (cached) return cached;

  const routes: LanguageRoutes = {
    // Match the pages `[...slug].astro` actually generates: drafts never get
    // a detail page, even in development.
    postSlugs: new Set(
      postsByLang(lang)
        .filter((post) => !post.data.isDraft)
        .map((post) => getSlugFromId(post.id)),
    ),
    postCategorySlugs: new Set(categoriesByLang(lang).map(slugify)),
  };

  routesCache.set(lang, routes);
  return routes;
};

/** Split a language-relative path into route segments. */
const segmentsOf = (path: string): string[] => normalizePath(path).split("/").filter(Boolean);

/**
 * Whether the language-relative `path` has a page in `lang`.
 *
 * Posts are translated per entry, so a page can exist in one language and
 * not another. Unknown paths are assumed to exist: the picker
 * should only cross out a language when it is certain there is no page.
 */
export const hasTranslation = (path: string, lang: LanguageKey): boolean => {
  const [section, first, ...rest] = segmentsOf(path);
  const routes = getLanguageRoutes(lang);

  if (section === "posts") {
    if (first === undefined) return true;
    if (first === "categories" && rest.length === 1) {
      return routes.postCategorySlugs.has(rest[0]);
    }
    if (first !== "categories") return routes.postSlugs.has([first, ...rest].join("/"));
    return false;
  }

  // Home, about, and any future static page are translated by the layout.
  return true;
};
