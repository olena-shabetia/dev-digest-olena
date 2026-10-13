import { z } from 'zod';
import { Severity } from './findings.js';
import { ReviewRecord } from './review-api.js';
import { RunSummary } from './trace.js';

/** Derived, never stored (criterion 69). */
export const MultiAgentRunStatus = z.enum(['running', 'done', 'failed', 'partial']);
export type MultiAgentRunStatus = z.infer<typeof MultiAgentRunStatus>;

/** One child's stance on one finding group (criteria 35-37). */
export const VerdictState = z.enum(['flagged', 'did_not_flag', 'running', 'failed', 'cancelled']);
export type VerdictState = z.infer<typeof VerdictState>;

export const GroupVerdict = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  state: VerdictState,
  /** Highest severity among this agent's findings in the group; null unless flagged. */
  severity: Severity.nullable(),
  /** Title of this agent's top finding in the group; null unless flagged. */
  title: z.string().nullable(),
  /** This agent's member finding ids (headline order); [] unless flagged. */
  finding_ids: z.array(z.string()),
});
export type GroupVerdict = z.infer<typeof GroupVerdict>;

export const FindingGroup = z.object({
  /** Stable across refetches of the same data: `grp_` + the smallest member finding id. */
  id: z.string(),
  file: z.string(),
  /** Union range: min / max over members after per-finding min/max normalisation. */
  start_line: z.number().int(),
  end_line: z.number().int(),
  /** Title of finding_ids[0]. */
  headline: z.string(),
  /** Highest member severity. */
  severity: Severity,
  /** All members, sorted by the headline comparator (see WU-3). */
  finding_ids: z.array(z.string()),
  conflict: z.boolean(),
  /** One per child run, in batch order — every child, never only flaggers. */
  verdicts: z.array(GroupVerdict),
});
export type FindingGroup = z.infer<typeof FindingGroup>;

export const MultiAgentRunTotals = z.object({
  /** Sum of children's non-null cost_usd; null when no child has a known cost. */
  cost_usd: z.number().nullable(),
  /** True when any FINISHED child (done/failed/cancelled) has a null cost. */
  cost_partial: z.boolean(),
  /** Wall-clock ms; null while in progress or when unknown. */
  duration_ms: z.number().int().nullable(),
  in_progress: z.boolean(),
});
export type MultiAgentRunTotals = z.infer<typeof MultiAgentRunTotals>;

export const MultiAgentChild = z.object({
  run: RunSummary,
  /** The child's review (with findings); null when none was persisted. */
  review: ReviewRecord.nullable(),
});
export type MultiAgentChild = z.infer<typeof MultiAgentChild>;

/** GET /multi-agent-runs/:id */
export const MultiAgentRunDetail = z.object({
  id: z.string(),
  pr_id: z.string(),
  repo_id: z.string(),
  pr_number: z.number().int(),
  pr_title: z.string(),
  ran_at: z.string(), // ISO
  status: MultiAgentRunStatus,
  agent_count: z.number().int(),
  totals: MultiAgentRunTotals,
  /** Batch order = submission order (multi_agent_position asc). */
  children: z.array(MultiAgentChild),
  groups: z.array(FindingGroup),
});
export type MultiAgentRunDetail = z.infer<typeof MultiAgentRunDetail>;

/** GET /repos/:id/multi-agent-runs — one row of the run list. */
export const MultiAgentRunListItem = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int(),
  pr_title: z.string(),
  ran_at: z.string(), // ISO
  status: MultiAgentRunStatus,
  agent_count: z.number().int(),
  totals: MultiAgentRunTotals,
});
export type MultiAgentRunListItem = z.infer<typeof MultiAgentRunListItem>;

/** GET /agent-run-estimates — one per workspace agent (criteria 61-62). */
export const AgentRunEstimate = z.object({
  agent_id: z.string(),
  /** Count of this agent's status='done' runs in the workspace, all-time. */
  sample_size: z.number().int(),
  /** Mean duration_ms over done runs with non-null duration; null when none. */
  avg_duration_ms: z.number().nullable(),
  /** Mean cost_usd over done runs with non-null cost; null when none. */
  avg_cost_usd: z.number().nullable(),
});
export type AgentRunEstimate = z.infer<typeof AgentRunEstimate>;
