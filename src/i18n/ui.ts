// Translation dictionary and locale metadata for the site.
//
// This site is Korean-only — there is no language switcher and no `/ko/`
// URL prefix (see src/i18n/utils.ts: useTranslatedPath skips the language
// segment entirely for the default/only language). This file still follows
// the shape of Astro's i18n recipe so a second language could be added later
// without restructuring anything.

export const languages = {
  ko: "한국어",
} as const;

export const defaultLang = "ko" satisfies keyof typeof languages;

// IETF BCP 47 language tag, used for the <html lang> attribute.
export const languageTags = {
  ko: "ko",
} as const;

// Compact labels the language picker would show in the narrow top bar.
// Kept even though there's only one language today, to match ui's shape.
export const languageShortNames = {
  ko: "KO",
} as const satisfies Record<keyof typeof languages, string>;

const ko = {
  "nav.home": "Home",
  "nav.posts": "Posts",
  "nav.about": "About Me",
  "home.postsByCategory": "Posts by Category",
  "home.more": "… {count}개 더",
  "posts.title": "POSTS",
  "posts.description": "모든 글, 최신순.",
  "posts.count": "{count}개",
  "categories.title": "Categories",
  "categories.description": "Posts grouped by category, newest first.",
  "categories.more": "… {count} more",
  "categories.less": "… less",
  "common.back": "[ 뒤로 ]",
  "common.top": "[ 위로 ]",
  "footer.links": "LINK:",
  "language.select": "언어를 선택하세요",
  "language.unavailable": "이 언어로는 제공되지 않습니다",
  "notfound.kicker": "오류 404 · 이 호에는 없음",
  "notfound.title": "이 페이지는 인쇄된 적이 없습니다.",
  "notfound.body":
    "찾으시는 문서가 보관함에 없습니다. 옮겨졌거나 내려갔을 수 있고, 주소에 오타가 있을 수도 있습니다.",
  "notfound.pathLabel": "요청한 경로",
  "theme.toggle": "색상 테마 전환",
  "theme.light": "[밝게]",
  "theme.dark": "[어둡게]",
} as const;

export const ui = {
  ko,
} satisfies Record<keyof typeof languages, Record<string, string>>;

export type LanguageKey = keyof typeof languages;
export type TranslationKey = keyof typeof ko;
