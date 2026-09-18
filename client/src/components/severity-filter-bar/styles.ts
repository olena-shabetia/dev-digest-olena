import type { CSSProperties } from "react";

export const s = {
  bar: (compact: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: compact ? 10 : 8,
    flexWrap: "wrap",
  }),
  pill: (color: string, bg: string, active: boolean, dimmed: boolean, interactive = true): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 9px",
    borderRadius: 5,
    fontSize: 12,
    fontWeight: 600,
    color,
    background: bg,
    border: active ? `1px solid ${color}` : "1px solid transparent",
    opacity: dimmed ? 0.55 : 1,
    cursor: interactive ? "pointer" : "default",
    lineHeight: 1.4,
  }),
  /** Compact, read-only chip: icon + number only, no background/border box —
   *  each chip gets its own dashed underline, in its own severity color, as
   *  the "this reveals more on hover" affordance. */
  compactItem: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    paddingBottom: 2,
    borderBottom: `1px dashed ${color}`,
    fontSize: 12,
    fontWeight: 600,
    color,
    lineHeight: 1.4,
  }),
} as const;
