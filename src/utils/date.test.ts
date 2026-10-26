import { describe, expect, it } from "vitest";
import { formatDate } from "@/utils/date";

describe("formatDate", () => {
  it("formats a date as YYYY-MM-DD", () => {
    expect(formatDate(new Date(Date.UTC(2024, 5, 9)))).toBe("2024-06-09");
  });

  it("pads single-digit months and days", () => {
    expect(formatDate(new Date(Date.UTC(2024, 0, 5)))).toBe("2024-01-05");
  });

  it("drops the time of day", () => {
    expect(formatDate(new Date(Date.UTC(2024, 11, 31, 23, 59, 59)))).toBe("2024-12-31");
  });

  it("reads the calendar day in UTC, not the local timezone", () => {
    // 2024-01-01T01:00Z is still 2023-12-31 in America/New_York.
    expect(formatDate(new Date(Date.UTC(2024, 0, 1, 1)))).toBe("2024-01-01");
  });
});
