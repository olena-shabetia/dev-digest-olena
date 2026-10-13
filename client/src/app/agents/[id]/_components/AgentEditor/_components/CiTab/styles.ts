import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 20, maxWidth: 1000 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 16px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  repo: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 14,
  } satisfies CSSProperties,
  meta: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  link: { fontSize: 13, color: "var(--accent-text)", textDecoration: "none" } satisfies CSSProperties,
  addRow: {
    display: "flex",
    justifyContent: "center",
    padding: 12,
    borderRadius: 10,
    border: "1px dashed var(--border-strong)",
  } satisfies CSSProperties,
  section: { fontSize: 14, fontWeight: 700 } satisfies CSSProperties,
  failOn: { maxWidth: 360 } satisfies CSSProperties,
} as const;
