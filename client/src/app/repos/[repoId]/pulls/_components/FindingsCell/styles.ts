import type { CSSProperties } from "react";
import { POPOVER_Z_INDEX } from "./constants";

export const s = {
  cell: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    cursor: "default",
  } satisfies CSSProperties,
  none: { color: "var(--text-muted)" } satisfies CSSProperties,
  popover: {
    position: "fixed",
    zIndex: POPOVER_Z_INDEX,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    boxShadow: "0 8px 24px rgba(0,0,0,.35)",
    padding: "10px 14px",
    // Read-only — nothing inside is clickable, so let hover pass through to
    // whatever is underneath rather than fighting the trigger's own timers.
    pointerEvents: "none",
  } satisfies CSSProperties,
  title: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 8,
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  row: { display: "flex", gap: 8, alignItems: "flex-start" } satisfies CSSProperties,
  rowMain: { minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 3 } satisfies CSSProperties,
  rowTitleLine: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  rowTitle: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  rowMeta: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  location: { fontSize: 11.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  description: {
    fontSize: 12,
    color: "var(--text-secondary)",
    overflow: "hidden",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
  } satisfies CSSProperties,
  more: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
