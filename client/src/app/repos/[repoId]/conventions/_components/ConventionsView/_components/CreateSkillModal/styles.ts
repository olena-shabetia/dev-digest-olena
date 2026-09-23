import type { CSSProperties } from "react";

export const s = {
  banner: {
    fontSize: 13,
    color: "var(--text-secondary)",
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 14px",
    marginBottom: 20,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  body: { padding: "0 24px 20px" } satisfies CSSProperties,
  enabledRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  tokenCount: { fontSize: 12, color: "var(--text-muted)", marginTop: 6, textAlign: "right" } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  footerNote: { fontSize: 12.5, color: "var(--text-muted)", flex: 1 } satisfies CSSProperties,
} as const;
