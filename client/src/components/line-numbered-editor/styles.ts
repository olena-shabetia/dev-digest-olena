import type { CSSProperties } from "react";

/** Co-located styles for LineNumberedEditor — a plain textarea + a
 *  synced-scroll line-number gutter, no syntax highlighting. */
export const s = {
  wrap: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  filename: {
    fontSize: 12,
    fontFamily: "var(--font-mono, monospace)",
    color: "var(--text-secondary)",
    fontWeight: 500,
  } satisfies CSSProperties,
  body: {
    display: "flex",
    alignItems: "stretch",
    maxHeight: 360,
  } satisfies CSSProperties,
  gutter: {
    margin: 0,
    padding: "10px 10px 10px 0",
    textAlign: "right",
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 13,
    lineHeight: "20px",
    userSelect: "none",
    overflow: "hidden",
    flexShrink: 0,
    minWidth: 32,
    background: "var(--bg-surface)",
    borderRight: "1px solid var(--border)",
  } satisfies CSSProperties,
  textarea: {
    flex: 1,
    resize: "vertical",
    border: "none",
    outline: "none",
    padding: "10px 12px",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 13,
    lineHeight: "20px",
    color: "var(--text-primary)",
    background: "transparent",
    minHeight: 200,
  } satisfies CSSProperties,
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    padding: "6px 12px",
    borderTop: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
