import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 24, maxWidth: 1000 } satisfies CSSProperties,
  metricsHead: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  metricsTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  link: { fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" } satisfies CSSProperties,
  casesHead: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  heading: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  passing: {
    fontSize: 12,
    fontWeight: 600,
    padding: "3px 10px",
    borderRadius: 6,
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  errored: { fontSize: 12, color: "var(--warning, #d29922)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 10, listStyle: "none", margin: 0, padding: 0 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-secondary)", padding: "24px 0" } satisfies CSSProperties,
} as const;
