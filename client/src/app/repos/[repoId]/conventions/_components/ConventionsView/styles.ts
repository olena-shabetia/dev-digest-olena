import type { CSSProperties } from "react";

export const s = {
  pageHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    padding: "24px 28px 16px",
  } satisfies CSSProperties,
  pageTitle: { fontSize: 20, fontWeight: 700 } satisfies CSSProperties,
  pageSubtitle: { fontSize: 13.5, color: "var(--text-secondary)", marginTop: 6 } satisfies CSSProperties,
  scanningNote: {
    fontSize: 13,
    color: "var(--accent-text)",
    marginTop: 6,
    display: "flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  candidateCount: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
  degradedNote: { fontSize: 12.5, color: "var(--warn)", marginTop: 4 } satisfies CSSProperties,
  headerActions: { display: "flex", gap: 10, flexShrink: 0 } satisfies CSSProperties,
  list: { padding: "0 28px 28px" } satisfies CSSProperties,
  loadingStack: { padding: "0 28px 28px", display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
} as const;
