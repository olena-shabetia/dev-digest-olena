export const s = {
  table: { width: "100%", borderCollapse: "collapse", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 10 },
  th: { textAlign: "left", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", padding: "10px 14px", borderBottom: "1px solid var(--border)" },
  td: { padding: "10px 14px", fontSize: 14, borderBottom: "1px solid var(--border)", verticalAlign: "top" },
  muted: { color: "var(--text-muted)" },
  error: { fontSize: 12, color: "var(--crit)", marginTop: 4, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  errored: { fontSize: 12, color: "var(--crit)", marginLeft: 8 },
} as const;
