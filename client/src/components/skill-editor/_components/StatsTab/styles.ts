import type { CSSProperties } from "react";

/** Co-located styles for StatsTab. */
export const s = {
  tile: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 18px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    marginBottom: 20,
  } satisfies CSSProperties,
  tileCount: { fontSize: 22, fontWeight: 700 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  rowName: { flex: 1, fontSize: 13.5, fontWeight: 500 } satisfies CSSProperties,
} as const;
