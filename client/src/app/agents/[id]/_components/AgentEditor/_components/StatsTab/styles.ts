import type { CSSProperties } from "react";

/** Co-located styles for the Stats tab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 24, maxWidth: 900 } satisfies CSSProperties,
  tiles: { display: "flex", gap: 14 } satisfies CSSProperties,
  section: {
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
    padding: 18,
  } satisfies CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 14 } satisfies CSSProperties,
  sevRow: { display: "flex", alignItems: "center", gap: 12, padding: "6px 0" } satisfies CSSProperties,
  sevBarTrack: { flex: 1, height: 10, background: "var(--bg-hover)", borderRadius: 3, overflow: "hidden" } satisfies CSSProperties,
  sevBarFill: (pct: number, color: string): CSSProperties => ({
    width: `${pct}%`,
    height: "100%",
    background: color,
    borderRadius: 3,
  }),
  sevCount: { fontSize: 13, fontWeight: 600, width: 28, textAlign: "right" } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: {
    textAlign: "left",
    padding: "8px 10px",
    color: "var(--text-muted)",
    fontWeight: 600,
    fontSize: 12,
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  td: { padding: "8px 10px", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  empty: { padding: "16px 0", color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
} as const;
