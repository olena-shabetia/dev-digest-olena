import type { CSSProperties } from "react";

// Mirrors the N6 "Project Context" design (specs/DevDigest Design
// (standalone) (5).html, module `screen_tour_context.jsx`): a 240px file
// sidebar with its own compact header (label + root glob + rescan), and a
// full-height preview pane — not a page-wide title bar above a grid. The
// design's Edit toggle, new-file/folder/upload icons, "chunks" footer and
// coverage ring are deliberate non-goals here (SPEC-03).
export const s = {
  centerBody: { padding: "24px 28px 28px" } satisfies CSSProperties,
  loadingStack: { padding: "24px 28px 28px", display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  notCloned: { fontSize: 13.5, color: "var(--text-secondary)", padding: "24px 0" } satisfies CSSProperties,
  rootsHint: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 8 } satisfies CSSProperties,

  split: { display: "flex", height: "100%" } satisfies CSSProperties,

  sidebar: {
    width: 240,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  sidebarHeader: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "14px 14px 10px",
  } satisfies CSSProperties,
  sidebarLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--text-muted)",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  sidebarSubtitle: {
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 11.5,
    color: "var(--text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  sidebarActions: { display: "flex", gap: 4, marginTop: 8 } satisfies CSSProperties,

  list: {
    flex: 1,
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "0 8px 12px",
  } satisfies CSSProperties,
  row: (selected: boolean) =>
    ({
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      padding: "7px 9px",
      borderRadius: 6,
      cursor: "pointer",
      border: "none",
      background: selected ? "var(--bg-hover)" : "transparent",
      textAlign: "left",
      width: "100%",
      font: "inherit",
      color: selected ? "var(--text-primary)" : "var(--text-secondary)",
    }) satisfies CSSProperties,
  rowPath: {
    fontSize: 12.5,
    fontFamily: "var(--font-mono, monospace)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,

  sidebarFooter: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "11px 14px",
    borderTop: "1px solid var(--border)",
    fontSize: 11,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  sidebarFooterDot: {
    width: 6,
    height: 6,
    borderRadius: 99,
    background: "var(--ok)",
    flexShrink: 0,
  } satisfies CSSProperties,

  main: {
    flex: 1,
    minWidth: 0,
    overflow: "auto",
    padding: "20px 24px 28px",
  } satisfies CSSProperties,
  selectDoc: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200,
    color: "var(--text-muted)",
    fontSize: 13.5,
    padding: 24,
    textAlign: "center",
  } satisfies CSSProperties,
} as const;
