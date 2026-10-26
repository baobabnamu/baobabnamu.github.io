export const themeStorageKey = "theme";

export type Theme = "light" | "dark";

/** Return a supported theme, falling back to the site's default palette. */
export function getTheme(value: string | null): Theme {
  return value === "dark" ? "dark" : "light";
}

/** Return the other available theme. */
export function toggleTheme(theme: Theme): Theme {
  return theme === "light" ? "dark" : "light";
}
