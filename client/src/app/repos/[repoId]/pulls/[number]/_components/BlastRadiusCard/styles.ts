import type { CSSProperties } from "react";

/** Co-located styles for BlastRadiusCard, BlastTree and BlastGraph. */
export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  toggleGroup: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  statsRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 16,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  statItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  statSep: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  degradedRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "var(--warn)",
  } satisfies CSSProperties,
  emptyRow: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  // ---- BlastTree ----
  treeRoot: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,
  row: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "6px 0",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  rowHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    color: "var(--text-primary)",
    fontSize: 13,
  } satisfies CSSProperties,
  rowHeaderSymbol: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flex: 1,
  } satisfies CSSProperties,
  rowHeaderCount: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  callerList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    paddingLeft: 24,
  } satisfies CSSProperties,
  callerLine: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  badgeRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    paddingLeft: 24,
  } satisfies CSSProperties,
  footer: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginTop: 4,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  // ---- BlastGraph ----
  graphWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: 14,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    display: "inline-block",
  } satisfies CSSProperties,

  // ---- PriorPrs ----
  priorPrsHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    background: "none",
    border: "none",
    borderTop: "1px solid var(--border)",
    padding: "8px 0 0",
    marginTop: 4,
    cursor: "pointer",
    color: "var(--text-secondary)",
    fontSize: 13,
  } satisfies CSSProperties,
  priorPrsTitle: {
    flex: 1,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  priorPrsList: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    paddingLeft: 4,
    paddingTop: 10,
  } satisfies CSSProperties,
  priorPrItem: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 12,
    paddingBottom: 12,
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  priorPrTitleRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    fontSize: 13,
  } satisfies CSSProperties,
  priorPrBullet: {
    width: 6,
    height: 6,
    borderRadius: 99,
    background: "var(--text-muted)",
    flexShrink: 0,
    marginTop: 6,
  } satisfies CSSProperties,
  priorPrTitleText: {
    color: "var(--text-primary)",
    fontWeight: 600,
  } satisfies CSSProperties,
  priorPrAuthorRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    paddingLeft: 14,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  priorPrNotes: {
    margin: 0,
    paddingLeft: 14,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  priorPrMeta: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
