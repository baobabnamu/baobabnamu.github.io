import type { TranslationKey } from "@/i18n/ui";

export interface NavItem {
  name: string;
  /** Localized href, including the deployment base. */
  url: string;
  /** Language-relative path used to detect the active item, e.g. `/posts`. */
  path: string;
  /** Whether this item is hidden below the desktop (`md`) breakpoint. */
  hideOnMobile?: boolean;
}

/** A navigation entry as stored in the site config. */
export interface NavigationEntry {
  translationKey: string;
  url: string;
  hideOnMobile?: boolean;
}

/** Collapse a path to a comparable form: no trailing slash except the root. */
export const normalizePath = (path: string): string => {
  const segments = path.split("/").filter(Boolean);
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
};

/**
 * Whether `currentPath` is `targetPath` or lives underneath it. The root only
 * matches itself, so the home item does not stay active on every page.
 */
export const isPathActive = (currentPath: string, targetPath: string): boolean => {
  const current = normalizePath(currentPath);
  const target = normalizePath(targetPath);
  if (target === "/") return current === "/";
  return current === target || current.startsWith(`${target}/`);
};

/**
 * Turns the config's navigation entries into renderable items: the label is
 * translated, the href is localized, and the language-relative path is kept
 * for active-state detection.
 */
export const buildNav = (
  navigation: NavigationEntry[],
  t: (key: TranslationKey) => string,
  translatePath: (path: string) => string,
): NavItem[] =>
  navigation.map((item) => ({
    name: t(item.translationKey as TranslationKey),
    url: translatePath(item.url),
    path: normalizePath(item.url),
    ...(item.hideOnMobile ? { hideOnMobile: true } : {}),
  }));
