import type { CSSProperties } from "react";

/** Co-located styles for ProjectDocPreview / ProjectDocPreviewDrawer. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  header: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    // Bleeds past the ambient 24px side padding both callers use (page
    // `main`, kit `Drawer` body) so the border-bottom reaches the true
    // container edge instead of stopping at the content inset.
    margin: "0 -24px",
    padding: "0 24px 14px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  headerTop: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  path: {
    fontSize: 18,
    fontWeight: 600,
    color: "var(--text-primary)",
    wordBreak: "break-all",
    minWidth: 0,
  } satisfies CSSProperties,
  viewToggle: {
    display: "flex",
    gap: 2,
    padding: 2,
    border: "1px solid var(--border)",
    borderRadius: 7,
    flexShrink: 0,
  } satisfies CSSProperties,
  viewToggleBtn: (active: boolean): CSSProperties => ({
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 5,
    border: "none",
    cursor: "pointer",
    background: active ? "var(--bg-hover)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-muted)",
  }),
  usedBy: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-muted)",
    flexShrink: 0,
    whiteSpace: "nowrap",
    marginLeft: "auto",
  } satisfies CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  metaText: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  body: { fontSize: 13.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  raw: {
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 12.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    margin: 0,
  } satisfies CSSProperties,
} as const;
