export const EVAL_DRAFT_RUN_TIMEOUT_MS = 120_000;
/**
 * Ceiling for ONE case inside a set run. Cases run one after another, so a hung
 * provider call with no bound would stall the whole run — and the one-running-run
 * per agent index then blocks starting another. A timed-out case is recorded as
 * errored and the run moves on (the abandoned call is not cancelled, only no
 * longer waited on).
 */
export const EVAL_CASE_TIMEOUT_MS = 120_000;
/** The scheduled sweep fails a still-running set run only after this long. */
export const EVAL_RUN_STALE_MAX_AGE_MS = 30 * 60 * 1000;
export const EVAL_STALE_ERROR = 'Timed out: this eval run did not finish in time';
export const EVAL_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;
export const EVAL_RUN_HISTORY_LIMIT = 50;
export const EVAL_DASHBOARD_RECENT_LIMIT = 20;
export const EVAL_REAPED_ERROR = 'API restarted while this eval run was in progress';
export const FULL_FILE_FINDING_KINDS = ['secret_leak', 'lethal_trifecta', 'phantom', 'hook'] as const;
export const EVAL_ERROR = {
  findingUndecided: 'eval_finding_undecided', // 409  criterion 6
  agentMissing: 'eval_agent_missing', // 409  criterion 7
  findingOutdated: 'eval_finding_outdated', // 409  criterion 8
  invalidName: 'eval_invalid_name', // 422  criterion 15
  invalidDiff: 'eval_invalid_diff', // 422  criteria 13, 14a
  invalidExpectation: 'eval_invalid_expectation', // 422  criteria 14, 14a, 8a
  typeChanged: 'eval_expectation_type_changed', // 409  criterion 27
  caseExists: 'eval_case_exists', // 409  criterion 28, details { case_id }
  draftRunFailed: 'eval_draft_run_failed', // 502  A-17b, details { reason }
  draftRunTimeout: 'eval_draft_run_timeout', // 504  A-17c
  setEmpty: 'eval_set_empty', // 409  criterion 45
  compareInvalid: 'eval_compare_invalid', // 409  A-33, details { reason: 'different_agents' | 'not_completed' }
} as const;
/** details.reason for eval_invalid_diff (criterion 14a, A-11b). */
export const EVAL_DIFF_REASON = {
  empty: 'empty', // blank or whitespace-only text
  unparseable: 'unparseable', // non-empty text that parses to zero files
  noHunk: 'no_hunk', // one file, zero hunks
  multipleFiles: 'multiple_files', // >1 parsed file, >1 `diff --git` line, or ≠1 `+++ ` line (A-11a)
} as const;
/** details.reason for eval_invalid_expectation (criterion 14a, A-11b). */
export const EVAL_EXPECTATION_REASON = {
  fileEmpty: 'file_empty',
  fileMismatch: 'file_mismatch',
  lineNotPositiveInteger: 'line_not_positive_integer',
  startAfterEnd: 'start_after_end',
  outsideHunks: 'outside_hunks',
} as const;
