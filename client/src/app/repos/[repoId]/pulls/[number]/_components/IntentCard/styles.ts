import type { CSSProperties } from "react";

/** Co-located styles for IntentCard — structured like VerdictBanner's `s`. */
export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  summary: {
    fontSize: 16,
    lineHeight: 1.6,
    color: "var(--text-primary)",
    fontStyle: "italic",
    fontWeight: 500,
  } satisfies CSSProperties,
  error: {
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--crit)",
  } satisfies CSSProperties,
  columns: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  } satisfies CSSProperties,
  column: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  columnLabel: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  columnLabelIn: {
    color: "var(--ok)",
  } satisfies CSSProperties,
  columnItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 7,
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.4,
  } satisfies CSSProperties,
  columnItemOut: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  columnBullet: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  columnEmpty: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  sourcesRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  } satisfies CSSProperties,
  contextGaps: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 12,
    color: "var(--warn)",
  } satisfies CSSProperties,
} as const;
