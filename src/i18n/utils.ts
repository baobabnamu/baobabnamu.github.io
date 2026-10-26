import { defaultLang, ui, type LanguageKey, type TranslationKey } from "./ui";
import { stripBase, withBase } from "@/utils/base";

/** Narrow an arbitrary string (e.g. a URL segment) to a supported language. */
export function isLanguageKey(value: string | undefined): value is LanguageKey {
  return value !== undefined && value in ui;
}

/**
 * The language a content id belongs to, read from its leading `{lang}/`
 * segment (e.g. `zh-tw/my-post`). Returns `undefined` when the id carries no
 * language prefix.
 */
export function getLangFromId(id: string): LanguageKey | undefined {
  const [prefix] = id.split("/");
  return isLanguageKey(prefix) ? prefix : undefined;
}

/**
 * A content id with its leading language segment removed, so it can be used as
 * a URL slug. `zh-tw/my-post` becomes `my-post`; ids without a prefix are
 * returned unchanged.
 */
export function getSlugFromId(id: string): string {
  const lang = getLangFromId(id);
  return lang ? id.slice(lang.length + 1) : id;
}

/** Detect the page language from the current URL, falling back to the default. */
export function getLangFromUrl(url: URL): LanguageKey {
  const [, lang] = stripBase(url.pathname).split("/");
  return isLanguageKey(lang) ? lang : defaultLang;
}

/**
 * The current path with the language segment removed, e.g. `/zh-tw/posts/`
 * becomes `/posts/`. Used to link between languages without losing the page.
 */
export function getPathFromUrl(url: URL): string {
  const segments = stripBase(url.pathname).split("/").filter(Boolean);
  if (isLanguageKey(segments[0])) segments.shift();
  if (segments.length === 0) return "/";
  const trailingSlash = url.pathname.endsWith("/") ? "/" : "";
  return `/${segments.join("/")}${trailingSlash}`;
}

/**
 * Generate a translation function for the target language.
 * Missing keys fall back to the default language, then to the key itself.
 * `{name}` placeholders are replaced with the supplied params.
 *
 * @example const t = useTranslations("zh-tw"); t("home.more", { count: 3 })
 */
export function useTranslations(lang: LanguageKey = defaultLang) {
  return function t(key: TranslationKey, params?: Record<string, string | number>): string {
    // The dictionaries are kept in sync at build time, but fall back to the
    // default language and finally to the key so a lookup never renders blank.
    const localized: Record<string, string> = ui[lang];
    const fallback: Record<string, string> = ui[defaultLang];
    const translation = localized[key] ?? fallback[key] ?? key;
    if (params === undefined) return translation;
    return Object.entries(params).reduce(
      (acc, [name, value]) => acc.replaceAll(`{${name}}`, String(value)),
      translation,
    );
  };
}

/**
 * Prefix a language-relative path with the deployment base. This site is
 * Korean-only, so there is no `/ko/` URL segment to add — `target` only
 * matters again once a second language exists.
 * @example useTranslatedPath()("/posts") => "/posts"
 */
export function useTranslatedPath(lang: LanguageKey = defaultLang) {
  return function translatePath(path: string, _target: LanguageKey = lang): string {
    const clean = path.startsWith("/") ? path : `/${path}`;
    return withBase(clean);
  };
}
