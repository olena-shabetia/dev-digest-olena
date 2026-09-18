/** Hover-intent delay before the popover opens (ms). */
export const HOVER_OPEN_MS = 120;
/** Close delay after the pointer leaves the trigger (ms) — long enough to
 *  cross the ~8px gap to the popover itself without closing under the
 *  cursor. Cancelled if the pointer enters the popover within this window,
 *  and cancelled/reset if it re-enters the trigger. Needed because the
 *  popover now holds a scrollable list and a clickable file:line link, so
 *  it can no longer be `pointer-events: none`. */
export const HOVER_CLOSE_MS = 200;

export const POPOVER_WIDTH = 380;
/** Minimum gap kept between the popover and the viewport edge. */
export const VIEWPORT_MARGIN = 12;
/** Estimated header + per-row heights, used to flip the popover above the
 *  trigger when it would otherwise overflow the viewport bottom. Estimated,
 *  not measured — keeps placement a pure function with no extra paint. */
export const POPOVER_HEADER_HEIGHT = 40;
export const POPOVER_ROW_HEIGHT = 72;
/** The finding list scrolls internally past this many rows, so a run/PR with
 *  many findings stays reachable (via scroll) instead of growing the popover
 *  off the edge of the viewport. */
export const POPOVER_MAX_VISIBLE_ROWS = 4;
export const POPOVER_LIST_MAX_HEIGHT = POPOVER_MAX_VISIBLE_ROWS * POPOVER_ROW_HEIGHT;

/** Above vendored dropdowns (40), below modal/drawer overlays (50) — see
 *  client/src/vendor/ui/kit/{Dropdown,SearchableSelect,Modal,Drawer}.tsx. */
export const POPOVER_Z_INDEX = 45;
