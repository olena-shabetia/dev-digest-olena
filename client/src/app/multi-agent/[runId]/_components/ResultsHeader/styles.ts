import type { CSSProperties } from "react";

export const s = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  topRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  titleGroup: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  subtitle: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  viewSwitch: {
    display: "inline-flex",
    gap: 4,
    padding: 3,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  metaRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  prLine: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    minWidth: 0,
  } satisfies CSSProperties,
  prNumber: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  prTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  summary: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
};
