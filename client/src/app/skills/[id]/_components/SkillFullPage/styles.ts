import type { CSSProperties } from "react";

export const s = {
  shell: { display: "flex", flexDirection: "column", height: "calc(100vh - 52px)" } as CSSProperties,
  backRow: { padding: "16px 28px 0" } as CSSProperties,
  backLink: { fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" } as CSSProperties,
  loading: { padding: 28, display: "flex", flexDirection: "column", gap: 16 } as CSSProperties,
};
