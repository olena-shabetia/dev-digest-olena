import {
  POPOVER_WIDTH,
  VIEWPORT_MARGIN,
  POPOVER_HEADER_HEIGHT,
  POPOVER_ROW_HEIGHT,
  POPOVER_FOOTER_HEIGHT,
} from "./constants";

export interface Placement {
  top: number;
  left: number;
}

/** Estimated popover height for `previewCount` rows — deterministic, no DOM
 *  measurement, so placement stays a pure function testable without layout. */
export function estimateHeight(previewCount: number, hasMore: boolean): number {
  return (
    POPOVER_HEADER_HEIGHT +
    previewCount * POPOVER_ROW_HEIGHT +
    (hasMore ? POPOVER_FOOTER_HEIGHT : 0)
  );
}

/**
 * Right-aligns the popover to the trigger's cell, flips above when there is
 * no room below, and clamps horizontally so it never runs off either edge —
 * a plain viewport calculation, since the trigger sits inside a scroll
 * container with `overflow: hidden` and the popover is portaled to
 * `document.body` (fixed positioning) to escape that clipping.
 */
export function placePopover(
  rect: { top: number; bottom: number; right: number },
  height: number,
  viewport: { width: number; height: number },
): Placement {
  const fitsBelow = rect.bottom + height + VIEWPORT_MARGIN <= viewport.height;
  const top = fitsBelow ? rect.bottom + 8 : Math.max(VIEWPORT_MARGIN, rect.top - height - 8);
  const left = Math.min(
    Math.max(rect.right - POPOVER_WIDTH, VIEWPORT_MARGIN),
    viewport.width - POPOVER_WIDTH - VIEWPORT_MARGIN,
  );
  return { top, left };
}
