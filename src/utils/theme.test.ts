import { describe, expect, it } from "vitest";
import { getTheme, toggleTheme } from "@/utils/theme";

describe("getTheme", () => {
  it("uses the saved dark preference", () => {
    expect(getTheme("dark")).toBe("dark");
  });

  it("falls back to the light theme for missing or invalid preferences", () => {
    expect(getTheme(null)).toBe("light");
    expect(getTheme("system")).toBe("light");
  });
});

describe("toggleTheme", () => {
  it("switches between the available themes", () => {
    expect(toggleTheme("light")).toBe("dark");
    expect(toggleTheme("dark")).toBe("light");
  });
});
