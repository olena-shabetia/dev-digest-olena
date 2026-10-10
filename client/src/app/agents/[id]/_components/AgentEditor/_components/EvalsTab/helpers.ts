import type { EvalCaseListItem } from "@devdigest/shared";
import type { CaseRowStatus } from "./constants";

/** Row status straight from the server-provided last result. */
export function caseStatus(c: EvalCaseListItem): CaseRowStatus {
  return c.last_result ? c.last_result.status : "never";
}

/** `file:start-end` (a single line collapses to `file:start`). */
export function formatTarget(e: EvalCaseListItem["expectation"]): string {
  return e.start_line === e.end_line ? `${e.file}:${e.start_line}` : `${e.file}:${e.start_line}-${e.end_line}`;
}
