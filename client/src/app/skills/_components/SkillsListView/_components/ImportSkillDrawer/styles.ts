import type { CSSProperties } from "react";

/** Co-located styles for ImportSkillDrawer. */
export const s = {
  section: { marginBottom: 18 } satisfies CSSProperties,
  fileRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px dashed var(--border-strong)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  previewCard: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  previewRow: { display: "flex", gap: 8, fontSize: 13 } satisfies CSSProperties,
  previewLabel: { color: "var(--text-muted)", minWidth: 90, flexShrink: 0 } satisfies CSSProperties,
  previewValue: { color: "var(--text-primary)" } satisfies CSSProperties,
  bodyBox: { maxHeight: 260, overflow: "auto" } satisfies CSSProperties,
  warnBox: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 12,
    borderRadius: 7,
    background: "var(--warn-bg, var(--bg-hover))",
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", marginTop: 8 } satisfies CSSProperties,
  success: { fontSize: 13, color: "var(--ok)", marginTop: 8 } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
