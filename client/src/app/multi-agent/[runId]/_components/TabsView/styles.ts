import type { CSSProperties } from "react";

export const s = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,
  findings: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
};
