import type { CSSProperties } from "react";

/** Co-located styles for the Skills tab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", justifyContent: "space-between" } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45 } satisfies CSSProperties,
  list: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  row: (dragging: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderBottom: "1px solid var(--border)",
    background: dragging ? "var(--bg-hover)" : "transparent",
    opacity: dragging ? 0.7 : 1,
  }),
  handle: (draggable: boolean): CSSProperties => ({
    display: "inline-flex",
    color: "var(--text-muted)",
    cursor: draggable ? "grab" : "default",
    visibility: draggable ? "visible" : "hidden",
    flexShrink: 0,
  }),
  name: { fontSize: 14, fontWeight: 500, flex: 1 } satisfies CSSProperties,
  empty: { padding: "24px 12px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
} as const;
