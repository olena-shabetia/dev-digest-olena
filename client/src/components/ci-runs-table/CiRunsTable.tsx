/* CiRunsTable — ingested CI runs (SPEC-15 crit. 23–25). Shared by the /ci-runs
   page and the agent CI tab. Ingest errors render above the rows, never instead. */
"use client";

import type React from "react";
import { useTranslations } from "next-intl";
import type { CiIngestError, CiRun } from "@devdigest/shared";
import { EmptyState } from "@devdigest/ui";
import { formatCost, formatSeconds } from "@/lib/format";
import { githubPrUrl, safeHttpUrl } from "@/lib/github-urls";

const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 12 },
  ingestError: {
    padding: "8px 12px",
    fontSize: 13,
    color: "var(--text-secondary)",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 8,
  },
  table: { width: "100%", borderCollapse: "collapse", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 10 },
  th: { textAlign: "left", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", padding: "10px 14px", borderBottom: "1px solid var(--border)" },
  td: { padding: "10px 14px", fontSize: 14, color: "var(--text-secondary)", borderBottom: "1px solid var(--border)" },
  tdName: { padding: "10px 14px", fontSize: 14, color: "var(--text-primary)", borderBottom: "1px solid var(--border)", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  link: { color: "var(--accent-text)", textDecoration: "none" },
  muted: { color: "var(--text-muted)" },
} as const satisfies Record<string, React.CSSProperties>;

const COLUMNS = ["repository", "pr", "agent", "verdict", "findings", "cost", "duration", "job"] as const;

export interface CiRunsTableProps {
  runs: CiRun[];
  ingestErrors: CiIngestError[];
  emptyTitle: string;
  emptyBody?: string;
}

export function CiRunsTable({ runs, ingestErrors, emptyTitle, emptyBody }: CiRunsTableProps) {
  const t = useTranslations("ci.runs");
  const dash = "—";

  const verdictText = (run: CiRun): string => {
    if (run.status === "failed") return t("failedReason", { reason: run.error ?? dash });
    return run.verdict ? t(`verdict.${run.verdict}`) : dash;
  };

  return (
    <div style={s.wrap}>
      {ingestErrors.map((e) => (
        <div key={`${e.repo}:${e.message}`} role="alert" style={s.ingestError}>
          {t("ingestError", { repo: e.repo, message: e.message })}
        </div>
      ))}
      {runs.length === 0 ? (
        <EmptyState title={emptyTitle} body={emptyBody} />
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c} style={s.th}>
                  {t(`columns.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td style={s.tdName} title={run.repo}>{run.repo}</td>
                <td style={s.td}>
                  {run.pr_number != null ? (
                    <a href={githubPrUrl(run.repo, run.pr_number)} target="_blank" rel="noreferrer" style={s.link}>
                      #{run.pr_number}
                    </a>
                  ) : (
                    dash
                  )}
                </td>
                <td style={s.tdName} title={run.agent_name ?? undefined}>{run.agent_name ?? dash}</td>
                <td style={s.td}>{verdictText(run)}</td>
                <td className="tnum" style={s.td}>{run.findings_count ?? dash}</td>
                <td className="tnum" style={s.td}>{formatCost(run.cost_usd)}</td>
                <td className="tnum" style={s.td}>{run.duration_ms != null ? formatSeconds(run.duration_ms) : dash}</td>
                <td style={s.td}>
                  {safeHttpUrl(run.job_url) ? (
                    <a href={safeHttpUrl(run.job_url)} target="_blank" rel="noreferrer" style={s.link}>
                      {t("jobLink")}
                    </a>
                  ) : (
                    dash
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
