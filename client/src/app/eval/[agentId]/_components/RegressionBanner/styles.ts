export const s = {
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "11px 16px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg, rgba(245, 158, 11, 0.08))",
    fontSize: 14,
    color: "var(--text-secondary)",
  },
  icon: { color: "var(--warn)", flexShrink: 0 },
  strong: { fontWeight: 700, color: "var(--text-primary)" },
} as const;
