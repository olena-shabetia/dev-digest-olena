import type { CSSProperties } from "react";

export const s = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  } satisfies CSSProperties,
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  } satisfies CSSProperties,
  toggleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  group: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflow: "hidden",
  } satisfies CSSProperties,
  groupHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  groupLoc: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono, monospace)",
  } satisfies CSSProperties,
  groupHeadline: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  verdictRow: {
    display: "flex",
    flexWrap: "wrap",
  } satisfies CSSProperties,
  verdictCell: {
    flex: "1 1 180px",
    minWidth: 180,
    padding: "10px 14px",
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,
  verdictAgent: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  verdictState: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  dot: {
    width: 6,
    height: 6,
    borderRadius: 99,
    background: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  verdictTitle: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
};
