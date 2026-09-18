import type { CSSProperties } from "react";

export const s = {
  cell: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    cursor: "default",
  } satisfies CSSProperties,
  none: { color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
