import { describe, expect, it } from "vitest";
import { defaultLang, languageShortNames, languageTags, languages, ui } from "@/i18n/ui";

describe("i18n dictionaries", () => {
  it("has one dictionary per supported language and vice versa", () => {
    expect(Object.keys(ui).sort()).toEqual(Object.keys(languages).sort());
  });

  it("gives every language the same set of translation keys", () => {
    const expected = Object.keys(ui[defaultLang]).sort();

    for (const lang of Object.keys(languages) as (keyof typeof ui)[]) {
      expect(Object.keys(ui[lang]).sort()).toEqual(expected);
    }
  });

  it("defines an html lang tag for every language", () => {
    expect(Object.keys(languageTags).sort()).toEqual(Object.keys(languages).sort());
  });

  it("gives every language a shorter label for the compact language picker", () => {
    expect(Object.keys(languageShortNames).sort()).toEqual(Object.keys(languages).sort());

    for (const [lang, name] of Object.entries(languages)) {
      const short = languageShortNames[lang as keyof typeof languages];
      expect(short.length).toBeGreaterThan(0);
      expect(short.length).toBeLessThan(name.length);
    }
  });
});
