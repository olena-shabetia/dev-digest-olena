import type { CSSProperties } from "react";

/** Co-located styles for ConfigTab — mirrors the agent editor's ConfigTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  actions: { display: "flex", gap: 10, alignItems: "center", marginTop: 10 } satisfies CSSProperties,
  changeNote: { flex: 1, maxWidth: 320 } satisfies CSSProperties,
  savedNote: { fontSize: 13, color: "var(--ok)" } satisfies CSSProperties,
} as const;
