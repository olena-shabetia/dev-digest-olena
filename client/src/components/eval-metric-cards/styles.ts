export const s = {
  row: { display: "flex", gap: 12 },
  card: {
    flex: 1,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: 16,
  },
  labelRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  label: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.03em" },
  valueRow: { display: "flex", alignItems: "baseline", gap: 10, marginTop: 10 },
  value: { fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" },
  na: { fontSize: 20, fontWeight: 600, color: "var(--text-muted)" },
  delta: { fontSize: 13, fontWeight: 600 },
} as const;
