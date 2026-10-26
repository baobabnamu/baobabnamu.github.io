import { describe, expect, it } from "vitest";
import { autoFillColumns } from "@/utils/grid";

describe("autoFillColumns", () => {
  it("fits as many equal-share columns as the width allows", () => {
    expect(autoFillColumns(320)).toBe("repeat(auto-fill, minmax(min(100%, 320px), 1fr))");
  });

  it("uses the given minimum width for each column", () => {
    expect(autoFillColumns(640)).toBe("repeat(auto-fill, minmax(min(100%, 640px), 1fr))");
  });

  it("lets a column shrink below its minimum on narrow screens", () => {
    expect(autoFillColumns(320)).toContain("min(100%, 320px)");
  });
});
