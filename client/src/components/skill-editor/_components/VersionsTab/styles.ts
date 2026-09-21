import type { CSSProperties } from "react";

/** Co-located styles for VersionsTab. */
export const s = {
  list: { display: "flex", flexDirection: "column", gap: 8, maxWidth: 720 } satisfies CSSProperties,
  row: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  rowHeader: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  versionLabel: { fontSize: 14, fontWeight: 700 } satisfies CSSProperties,
  date: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { marginLeft: "auto", display: "flex", gap: 8 } satisfies CSSProperties,
  changeNote: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  diffPanel: {
    marginTop: 10,
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  diffHeader: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  diffPre: {
    margin: 0,
    padding: 10,
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 12.5,
    lineHeight: "18px",
    background: "var(--bg-elevated)",
    borderRadius: 6,
    maxHeight: 360,
    overflow: "auto",
    whiteSpace: "pre-wrap",
  } satisfies CSSProperties,
  added: { display: "block", background: "var(--ok-bg, rgba(46,160,67,0.15))", color: "var(--ok)" } satisfies CSSProperties,
  removed: { display: "block", background: "var(--crit-bg, rgba(248,81,73,0.15))", color: "var(--crit)" } satisfies CSSProperties,
  unchanged: { display: "block", color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
