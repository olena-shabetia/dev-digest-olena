import type { CSSProperties } from "react";

export const s = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    padding: 20,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  heading: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  } satisfies CSSProperties,
  placeholder: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "12px 0",
  } satisfies CSSProperties,
  selectAllRow: {
    display: "flex",
    justifyContent: "flex-end",
  } satisfies CSSProperties,
  selectAllBtn: {
    background: "none",
    border: "none",
    padding: 0,
    font: "inherit",
    fontSize: 12,
    color: "var(--accent)",
    cursor: "pointer",
  } satisfies CSSProperties,
  cards: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 12,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  footerText: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
};
