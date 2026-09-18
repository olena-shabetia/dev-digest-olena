import { describe, it, expect } from "vitest";
import { placePopover, estimateHeight } from "./helpers";
import { VIEWPORT_MARGIN, POPOVER_WIDTH } from "./constants";

describe("estimateHeight", () => {
  it("grows with the number of preview rows", () => {
    expect(estimateHeight(1, false)).toBeLessThan(estimateHeight(3, false));
  });

  it("adds room for the '+N more' footer only when there is more", () => {
    expect(estimateHeight(2, true)).toBeGreaterThan(estimateHeight(2, false));
  });
});

describe("placePopover", () => {
  const viewport = { width: 1200, height: 800 };

  it("places the popover below the trigger when there's room", () => {
    const rect = { top: 100, bottom: 120, right: 400 };
    const p = placePopover(rect, 200, viewport);
    expect(p.top).toBe(128);
  });

  it("flips above the trigger when there's no room below", () => {
    const rect = { top: 700, bottom: 720, right: 400 };
    const p = placePopover(rect, 200, viewport);
    expect(p.top).toBeLessThan(rect.top);
  });

  it("clamps left so the popover never runs off the right edge", () => {
    const rect = { top: 100, bottom: 120, right: viewport.width - 5 };
    const p = placePopover(rect, 100, viewport);
    expect(p.left).toBeLessThanOrEqual(viewport.width - POPOVER_WIDTH - VIEWPORT_MARGIN);
  });

  it("clamps left so the popover never runs off the left edge", () => {
    const rect = { top: 100, bottom: 120, right: 20 };
    const p = placePopover(rect, 100, viewport);
    expect(p.left).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
  });
});
