import type { IconName } from "@devdigest/ui";

/** Row status → icon (four distinct shapes, always paired with a text label)
 *  and its colour token. `never` is a case with no completed-run result. */
export type CaseRowStatus = "passed" | "failed" | "errored" | "never";

export const STATUS_ICON: Record<CaseRowStatus, IconName> = {
  passed: "CheckCircle",
  failed: "XCircle",
  errored: "AlertTriangle",
  never: "Clock",
};

export const STATUS_COLOR: Record<CaseRowStatus, string> = {
  passed: "var(--success, #3fb950)",
  failed: "var(--danger, #f85149)",
  errored: "var(--warning, #d29922)",
  never: "var(--text-muted)",
};
