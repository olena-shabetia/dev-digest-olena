import type { CSSProperties } from "react";

export const s = {
  bar: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
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
} as const;
