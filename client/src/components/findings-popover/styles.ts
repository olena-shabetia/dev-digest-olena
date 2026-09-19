import type { CSSProperties } from "react";
import { POPOVER_Z_INDEX, POPOVER_LIST_MAX_HEIGHT } from "./constants";

export const s = {
  popover: {
    position: "fixed",
    zIndex: POPOVER_Z_INDEX,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    boxShadow: "0 8px 24px rgba(0,0,0,.35)",
    // Right padding is tighter than the other sides on purpose — the list's
    // own scrollbar already reserves space there, so a full 14px would read
    // as an oversized empty gutter next to the thumb.
    padding: "10px 6px 10px 14px",
    // Holds a scrollable list and a clickable file:line link — the trigger's
    // own hover-intent timers bridge the gap instead (useFindingsHoverPopover
    // keeps it open while the pointer is over the popover itself).
    pointerEvents: "auto",
  } satisfies CSSProperties,
  title: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 8,
  } satisfies CSSProperties,
  // Scrolls once the list exceeds POPOVER_MAX_VISIBLE_ROWS, so a run/PR with
  // many findings stays fully reachable instead of growing past the viewport.
  // `overflowX: hidden` guarantees only the one (vertical) scrollbar ever
  // appears — a long mono file path wraps instead of forcing a horizontal
  // one, which on some platforms renders an unstyled native scrollbar-corner
  // square where the two would otherwise meet.
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    maxHeight: POPOVER_LIST_MAX_HEIGHT,
    overflowY: "auto",
    overflowX: "hidden",
    paddingRight: 8,
  } satisfies CSSProperties,
  row: { display: "flex", gap: 8, alignItems: "flex-start", minWidth: 0 } satisfies CSSProperties,
  rowMain: { minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  rowTitleLine: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  rowTitle: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  // file:line sits on its own line (not beside confidence) so a long path
  // wraps within the row instead of pushing the row wider than the popover.
  rowMeta: { display: "flex", overflowWrap: "anywhere" } satisfies CSSProperties,
  location: { fontSize: 11.5, color: "var(--text-secondary)", overflowWrap: "anywhere" } satisfies CSSProperties,
  // Always blue, not gray-until-hover like the vendored MonoLink — matches
  // the design, and signals "clickable" without requiring a hover first.
  link: {
    fontSize: 11.5,
    color: "var(--accent-text)",
    textDecoration: "underline",
    textUnderlineOffset: 2,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  description: {
    fontSize: 12,
    color: "var(--text-secondary)",
    overflow: "hidden",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
  } satisfies CSSProperties,
} as const;
