import { getCollection } from "astro:content";
import type { LanguageKey } from "@/i18n/ui";
import { getLangFromId } from "@/i18n/utils";

export const notes = await getCollection("note");

export const dateSortedNotes = [...notes].sort(
  (a, b) => b.data.publishDate.getTime() - a.data.publishDate.getTime(),
);

/** Notes written in the given language, newest first. */
export const notesByLang = (lang: LanguageKey) =>
  dateSortedNotes.filter((note) => getLangFromId(note.id) === lang);

/** The categories that have notes in the given language, alphabetically. */
export const noteCategoriesByLang = (lang: LanguageKey) =>
  [...new Set(notesByLang(lang).map((note) => note.data.category))].sort((a, b) =>
    a.localeCompare(b, "en", { sensitivity: "base" }),
  );

/** The given language's notes grouped by their category. */
export const notesByCategoryForLang = (lang: LanguageKey) =>
  noteCategoriesByLang(lang).map((category) => ({
    category,
    notes: notesByLang(lang).filter(
      (note) => note.data.category === category,
    ),
  }));
