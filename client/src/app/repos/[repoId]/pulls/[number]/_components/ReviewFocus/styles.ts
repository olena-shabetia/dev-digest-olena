import type { CSSProperties } from "react";

export const s = {
  list: { display: "flex", flexDirection: "column", gap: 12, margin: "10px 0 0", padding: 0, listStyle: "none" } satisfies CSSProperties,
  item: { display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 8, fontSize: 13, color: "var(--text-secondary)", overflowWrap: "anywhere", wordBreak: "break-word" } satisfies CSSProperties,
  bullet: { color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)", fontSize: 12.5, flexShrink: 0, minWidth: 20 } satisfies CSSProperties,
  link: {
    background: "none",
    border: "none",
    padding: "0 2px",
    lineHeight: 1.4,
    maxWidth: "100%",
    textAlign: "left",
    overflowWrap: "anywhere",
    wordBreak: "break-all",
    cursor: "pointer",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 12.5,
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  ref: { overflowWrap: "anywhere", wordBreak: "break-all", fontFamily: "var(--font-mono, monospace)", fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  reason: { minWidth: 0 } satisfies CSSProperties,
  headerRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
} as const;
