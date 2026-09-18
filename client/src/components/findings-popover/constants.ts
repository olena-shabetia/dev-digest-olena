/** Hover-intent delay before the popover opens (ms). Closes immediately on
 *  mouseleave — no matching close delay, since the popover itself is
 *  `pointer-events: none` (nothing inside it to move the cursor toward). */
export const HOVER_OPEN_MS = 120;

export const POPOVER_WIDTH = 380;
/** Minimum gap kept between the popover and the viewport edge. */
export const VIEWPORT_MARGIN = 12;
/** Estimated header + per-row heights, used to flip the popover above the
 *  trigger when it would otherwise overflow the viewport bottom. Estimated,
 *  not measured — keeps placement a pure function with no extra paint. */
export const POPOVER_HEADER_HEIGHT = 40;
export const POPOVER_ROW_HEIGHT = 72;
export const POPOVER_FOOTER_HEIGHT = 24;

/** Above vendored dropdowns (40), below modal/drawer overlays (50) — see
 *  client/src/vendor/ui/kit/{Dropdown,SearchableSelect,Modal,Drawer}.tsx. */
export const POPOVER_Z_INDEX = 45;
