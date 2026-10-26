import { describe, expect, it } from "vitest";
import { placeLanguageMenu } from "@/utils/placeLanguageMenu";

describe("placeLanguageMenu", () => {
  it("opens above a trigger that sits at the bottom of the viewport", () => {
    const trigger = { top: 560, right: 70, bottom: 580, left: 16 };
    const menu = { width: 140, height: 280 };
    const viewport = { width: 1280, height: 640 };

    const placed = placeLanguageMenu({ trigger, menu, viewport });

    expect(placed.maxHeight).toBe(menu.height);
    expect(placed.top).toBeGreaterThanOrEqual(8);
    expect(placed.top + placed.maxHeight).toBeLessThanOrEqual(trigger.top);
    expect(placed.left).toBe(trigger.left);
    expect(placed.left + menu.width).toBeLessThanOrEqual(viewport.width - 8);
  });

  it("opens below a trigger in the top bar and shifts left to stay on screen", () => {
    const trigger = { top: 16, right: 304, bottom: 36, left: 250 };
    const menu = { width: 180, height: 120 };
    const viewport = { width: 320, height: 500 };

    const placed = placeLanguageMenu({ trigger, menu, viewport });

    expect(placed.top).toBeGreaterThanOrEqual(trigger.bottom);
    expect(placed.top + placed.maxHeight).toBeLessThanOrEqual(viewport.height - 8);
    expect(placed.left).toBeGreaterThanOrEqual(8);
    expect(placed.left + menu.width).toBeLessThanOrEqual(viewport.width - 8);
    expect(placed.left).toBeLessThan(trigger.left);
  });

  it("caps the menu at the room left when the list is taller than the viewport", () => {
    const trigger = { top: 180, right: 40, bottom: 200, left: 16 };
    const menu = { width: 100, height: 1000 };
    const viewport = { width: 800, height: 400 };

    const placed = placeLanguageMenu({ trigger, menu, viewport });

    expect(placed.maxHeight).toBeLessThan(menu.height);
    expect(placed.top).toBeGreaterThanOrEqual(8);
    expect(placed.top + placed.maxHeight).toBeLessThanOrEqual(viewport.height - 8);
  });
});
