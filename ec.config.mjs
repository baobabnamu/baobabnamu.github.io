// Expressive Code configuration, shared by the Astro integration and the
// `<Code>` component. It lives here (rather than in `astro.config.mjs`)
// because `themeCssSelector` is a function, and the component needs options
// that can be serialized and loaded in its own Vite instance.
import { defineEcConfig } from "astro-expressive-code";

export default defineEcConfig({
  themes: ["github-light", "github-dark"],
  // The site's toggle sets `data-theme="light"` / `"dark"`, while the themes
  // are named `github-light` / `github-dark`. Renaming each theme to its type
  // lets Expressive Code's default `[data-theme='<name>']` selector match the
  // site, so `themeCssSelector` does not need to be overridden.
  customizeTheme: (theme) => {
    theme.name = theme.type;
  },
  // The site controls the theme itself. The default `prefers-color-scheme`
  // query would turn a light page dark when the OS is set to dark.
  useDarkModeMediaQuery: false,
  styleOverrides: {
    // Square corners and hairline borders, to match the printed layout.
    borderRadius: "0",
    borderColor: "var(--color-line)",
    codeBackground: "var(--color-paper)",
    codeFontFamily: "var(--font-mono)",
    uiFontFamily: "var(--font-mono)",
    codeFontSize: "0.85rem",
    codeLineHeight: "1.6",
    frames: {
      shadowColor: "transparent",
    },
  },
});
