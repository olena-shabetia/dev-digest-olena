export const s = {
  page: { padding: "28px 36px", maxWidth: 1200, display: "flex", flexDirection: "column", gap: 20 },
  back: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--text-secondary)", textDecoration: "none" },
  header: { display: "flex", alignItems: "flex-start", gap: 16, justifyContent: "space-between" },
  titleRow: { display: "flex", alignItems: "center", gap: 12, minWidth: 0 },
  title: { fontSize: 26, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 },
  sub: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 },
  errored: { fontSize: 13, color: "var(--crit)" },
  tableHead: { display: "flex", alignItems: "center", gap: 12 },
  heading: { fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" },
  selected: { fontSize: 13, color: "var(--text-secondary)" },
  spacer: { flex: 1 },
  muted: { color: "var(--text-muted)" },
} as const;
