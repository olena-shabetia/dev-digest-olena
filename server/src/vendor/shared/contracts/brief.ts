import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief, together with the model-written summary
 * and review focus. PrBriefRecord adds generation meta; PrBriefResponse is the
 * GET/POST /pulls/:id/brief payload (brief + current head_sha + stale flag).
 */

// ---- Intent ----
export const IntentConfidence = z.enum(['high', 'medium', 'low']);
export type IntentConfidence = z.infer<typeof IntentConfidence>;

export const IntentSourceKind = z.enum([
  'title', 'body', 'issue', 'issue_unkeyworded', 'spec', 'plan', 'files', 'hunks', 'commits',
]);
export type IntentSourceKind = z.infer<typeof IntentSourceKind>;

export const IntentSourceStatus = z.enum(['used', 'absent', 'unavailable']);
export type IntentSourceStatus = z.infer<typeof IntentSourceStatus>;

export const IntentSource = z.object({
  kind: IntentSourceKind,
  status: IntentSourceStatus,
  ref: z.string().nullish(),
  chars: z.number().int().nullish(),
});
export type IntentSource = z.infer<typeof IntentSource>;

export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  sources: z.array(IntentSource).default([]),
  confidence: IntentConfidence.default('low'),
  context_gaps: z.array(z.string()).default([]),
});
export type Intent = z.infer<typeof Intent>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Review focus ----
export const ReviewFocusItem = z.object({
  file: z.string(),
  line: z.number().int().min(1),
  reason: z.string(),
});
export type ReviewFocusItem = z.infer<typeof ReviewFocusItem>;

export const BriefDataGap = z.enum([
  'intent', 'blast', 'specs', 'files_truncated', 'hunks_truncated', 'findings',
]);
export type BriefDataGap = z.infer<typeof BriefDataGap>;

// ---- Composed PR Brief (pr_brief.json) ----
export const PrBrief = z.object({
  summary: z.string(),
  intent: Intent.nullable(),
  blast: BlastRadius.nullable(),
  risks: Risks,
  review_focus: z.array(ReviewFocusItem),
  history: PrHistory.default({ history: [] }),
});
export type PrBrief = z.infer<typeof PrBrief>;

export const BriefMeta = z.object({
  head_sha: z.string(),
  provider: z.string(),
  model: z.string(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  cost_usd: z.number().nullable(),
  generated_at: z.string(), // ISO 8601
  data_gaps: z.array(BriefDataGap),
});
export type BriefMeta = z.infer<typeof BriefMeta>;

export const PrBriefRecord = PrBrief.extend({ meta: BriefMeta });
export type PrBriefRecord = z.infer<typeof PrBriefRecord>;

export const PrBriefResponse = z.object({
  brief: PrBriefRecord.nullable(),
  head_sha: z.string(),
  stale: z.boolean(),
});
export type PrBriefResponse = z.infer<typeof PrBriefResponse>;
