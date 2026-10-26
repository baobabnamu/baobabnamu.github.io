import { describe, expect, it } from "vitest";
import { createGreeting } from "@/utils/greeting";

describe("createGreeting", () => {
  it("greets the provided name", () => {
    expect(createGreeting("Astro")).toBe("Hello, Astro!");
  });
});
