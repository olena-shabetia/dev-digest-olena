import type { CSSProperties } from "react";

export const s = {
  root: {
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
    padding: 16,
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  body: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    flex: 1,
    minWidth: 0,
  } satisfies CSSProperties,
  name: {
    fontSize: 15,
    fontWeight: 700,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  summary: {
    fontSize: 13.5,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  meta: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  trailing: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 8,
  } satisfies CSSProperties,
};
