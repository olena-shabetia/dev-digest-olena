import { z } from 'zod';
import { Verdict, Finding } from './findings.js';
import { EvalRun, EvalOwnerKind, Conformance, Provider, CiFailOn } from './knowledge.js';

/**
 * A4 — Eval / CI / Compose / Conformance API contracts (L06).
 *
 * These EXTEND the barrel; they do not modify existing contract files. The base
 * `EvalRun`, `EvalCase`, `EvalOwnerKind`, `Conformance` live in `knowledge.ts`;
 * here we add the *API-facing* request/response shapes (records persisted in
 * `eval_runs`, `composed_reviews`, `ci_installations`, `ci_runs`,
 * `conformance_checks`) plus the eval-dashboard aggregate.
 */

// ===========================================================================
// Eval — case input + persisted run record + dashboard
// ===========================================================================

/** Create/update payload for an eval case (id + owner resolved by the route). */
export const EvalCaseInput = z.object({
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string().min(1),
  input_diff: z.string().default(''),
  input_files: z.unknown().nullish(),
  input_meta: z.unknown().nullish(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCaseInput = z.infer<typeof EvalCaseInput>;

/** A persisted eval run row (one execution of a case), returned by the API. */
export const EvalRunRecord = z.object({
  id: z.string(),
  case_id: z.string(),
  case_name: z.string().nullish(),
  ran_at: z.string(),
  actual_output: z.unknown(),
  pass: z.boolean().nullable(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalRunRecord = z.infer<typeof EvalRunRecord>;

/** Result of running a single case: the metrics (EvalRun) + the persisted row id. */
export const EvalRunResult = z.object({
  run_id: z.string(),
  case_id: z.string(),
  result: EvalRun,
});
export type EvalRunResult = z.infer<typeof EvalRunResult>;

/** One point on the dashboard trend (per run, chronological). */
export const EvalTrendPoint = z.object({
  ran_at: z.string(),
  recall: z.number(),
  precision: z.number(),
  citation_accuracy: z.number(),
  pass_rate: z.number(),
  cost_usd: z.number().nullable(),
});
export type EvalTrendPoint = z.infer<typeof EvalTrendPoint>;

/** Aggregate dashboard for an owner (agent/skill) or the whole workspace. */
export const EvalDashboard = z.object({
  owner_kind: EvalOwnerKind.nullable(),
  owner_id: z.string().nullable(),
  cases_total: z.number().int(),
  current: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
    traces_passed: z.number().int(),
    traces_total: z.number().int(),
    cost_usd: z.number().nullable(),
  }),
  delta: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
  }),
  trend: z.array(EvalTrendPoint),
  recent_runs: z.array(EvalRunRecord),
  alert: z.string().nullable(),
});
export type EvalDashboard = z.infer<typeof EvalDashboard>;

// ===========================================================================
// Compose Review
// ===========================================================================

export const ComposeReviewInput = z.object({
  /** Finding ids to fold into the draft (optional — body may be hand-written). */
  finding_ids: z.array(z.string()).default([]),
  /** Editable markdown body. If omitted, the server composes one from findings. */
  body: z.string().nullish(),
  verdict: Verdict.default('comment'),
  /** When true, attach selected findings as inline comments (path+line+body). */
  inline_comments: z.boolean().default(false),
});
export type ComposeReviewInput = z.infer<typeof ComposeReviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type ComposeReviewInputBody = z.input<typeof ComposeReviewInput>;

/** A persisted composed review (mirrors the `composed_reviews` row). */
export const ComposedReview = z.object({
  id: z.string(),
  pr_id: z.string(),
  body: z.string(),
  verdict: Verdict.nullable(),
  posted_at: z.string().nullable(),
  github_review_id: z.string().nullable(),
});
export type ComposedReview = z.infer<typeof ComposedReview>;

/** A preview (no GitHub side-effect) of what would be posted. */
export const ComposeReviewPreview = z.object({
  body: z.string(),
  verdict: Verdict,
  inline_comments: z.array(
    z.object({ path: z.string(), line: z.number().int(), body: z.string() }),
  ),
});
export type ComposeReviewPreview = z.infer<typeof ComposeReviewPreview>;

// ===========================================================================
// Export-to-CI + CI Runs
// ===========================================================================

export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']); // unchanged
export type CiTarget = z.infer<typeof CiTarget>;

export const CiTrigger = z.enum(['opened', 'synchronize', 'reopened']);
export type CiTrigger = z.infer<typeof CiTrigger>;

export const CiPostAs = z.enum(['github_review', 'pr_comment', 'none']);
export type CiPostAs = z.infer<typeof CiPostAs>;

/** The deterministic GitHub review event the runner computed (crit. 19). */
export const CiVerdict = z.enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT']);
export type CiVerdict = z.infer<typeof CiVerdict>;

/** Path-safe slug for `.devdigest/agents/<slug>.yaml` / `.devdigest/skills/<slug>.md`
 *  — blocks path traversal at agent-runner/src/skills.ts (crit. 8). */
export const CiSlug = z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9-]*$/);

/** One generated file. `contents` is null only for the runner bundle (shown as
 *  name + size + sha256). Only the workflow is `editable`. */
export const CiFile = z.object({
  path: z.string(),
  contents: z.string().nullable(),
  editable: z.boolean(),
  size_bytes: z.number().int(),
  sha256: z.string(),
});
export type CiFile = z.infer<typeof CiFile>;

/** A Preview/Install problem — names the file and the cause, never a secret value. */
export const CiFileError = z.object({ path: z.string(), message: z.string() });
export type CiFileError = z.infer<typeof CiFileError>;

export const AgentManifest = z.object({
  schema_version: z.literal(1),
  agent_version: z.number().int().min(1),
  name: z.string().min(1),
  provider: Provider.default('openrouter'),
  model: z.string().min(1),
  system_prompt: z.string(),
  skills: z
    .array(CiSlug)
    .nullish()
    .transform((v) => v ?? []),
  strategy: z.enum(['auto', 'single-pass', 'map-reduce']).default('auto'),
  ci_fail_on: CiFailOn.default('critical'),
});
export type AgentManifest = z.infer<typeof AgentManifest>;
export type AgentManifestInput = z.input<typeof AgentManifest>;

/** Body of BOTH `POST /agents/:id/ci/preview` and `POST /agents/:id/export-ci`
 *  (preview ignores `action`). */
export const CiExportInput = z.object({
  /** Active repository `full_name` (crit. 5). */
  repo: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  target: z.literal('gha').default('gha'),
  /** 'open_pr' commits + opens/reuses a PR; 'files' returns a zip (crit. 15). */
  action: z.enum(['open_pr', 'files']).default('open_pr'),
  post_as: CiPostAs.default('github_review'),
  triggers: z.array(CiTrigger).min(1).default(['opened', 'synchronize']),
  /** Workflow text as shown/edited in Preview; omitted → the server generates it. */
  workflow: z.string().max(50_000).optional(),
});
export type CiExportInput = z.infer<typeof CiExportInput>;
export type CiExportInputBody = z.input<typeof CiExportInput>;

export const CiPreview = z.object({
  files: z.array(CiFile),
  errors: z.array(CiFileError),
  /** Name of a DIFFERENT agent already installed on this repo (crit. 13), else null. */
  conflict_agent_name: z.string().nullable(),
});
export type CiPreview = z.infer<typeof CiPreview>;

export const CiRunStatus = z.enum(['completed', 'failed']);
export type CiRunStatus = z.infer<typeof CiRunStatus>;

export const CiInstallationLatestRun = z.object({
  status: CiRunStatus,
  verdict: CiVerdict.nullable(),
  ran_at: z.string(),
});
export type CiInstallationLatestRun = z.infer<typeof CiInstallationLatestRun>;

export const CiInstallation = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_name: z.string().nullable(),
  repo: z.string(),
  target_type: CiTarget,
  agent_version: z.number().int(),
  pr_url: z.string(),
  installed_at: z.string(),
  updated_at: z.string(),
  latest_run: CiInstallationLatestRun.nullable(),
});
export type CiInstallation = z.infer<typeof CiInstallation>;

/** Response of `POST /agents/:id/export-ci`. */
export const CiExport = z.discriminatedUnion('action', [
  z.object({ action: z.literal('open_pr'), pr_url: z.string(), installation: CiInstallation }),
  z.object({ action: z.literal('files'), filename: z.string(), zip_base64: z.string() }),
]);
export type CiExport = z.infer<typeof CiExport>;

/** One ingested CI run (a `ci_runs` row joined to its `agent_runs` row + agent). */
export const CiRun = z.object({
  id: z.string(),
  installation_id: z.string().nullable(),
  repo: z.string(),
  pr_number: z.number().int().nullable(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  status: CiRunStatus,
  error: z.string().nullable(),
  verdict: CiVerdict.nullable(),
  findings_count: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  job_url: z.string().nullable(),
  ran_at: z.string(),
});
export type CiRun = z.infer<typeof CiRun>;

export const CiIngestError = z.object({ repo: z.string(), message: z.string() });
export type CiIngestError = z.infer<typeof CiIngestError>;

export const CiRunsResponse = z.object({
  runs: z.array(CiRun),
  ingest_errors: z.array(CiIngestError),
});
export type CiRunsResponse = z.infer<typeof CiRunsResponse>;

export const CiAgentOverview = z.object({
  installations: z.array(CiInstallation),
  runs: z.array(CiRun),
  ingest_errors: z.array(CiIngestError),
});
export type CiAgentOverview = z.infer<typeof CiAgentOverview>;

/** `devdigest-result.json` (crit. 19). Ingest trusts ONLY the review fields. */
export const CiResultArtifact = z.object({
  schema_version: z.literal(1),
  agent_version: z.number().int().min(1),
  model: z.string(),
  head_sha: z.string().min(1),
  verdict: CiVerdict,
  blockers: z.number().int().min(0),
  findings_count: z.number().int(),
  critical: z.number().int().nullish(),
  warning: z.number().int().nullish(),
  suggestion: z.number().int().nullish(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullish(),
  agent: z.string(),
  version: z.string().nullish(), // RUNNER_VERSION
  pr_number: z.number().int().nullish(),
});
export type CiResultArtifact = z.infer<typeof CiResultArtifact>;

// ===========================================================================
// Conformance (PRD ↔ PR) — API record (the analysis shape is `Conformance`)
// ===========================================================================

/** Request body for `POST /pulls/:id/conformance`. */
export const ConformanceInput = z.object({
  /** Spec path/id to compare against; if omitted, the first available spec. */
  spec: z.string().nullish(),
  provider: z.enum(['openai', 'anthropic', 'openrouter']).nullish(),
  model: z.string().nullish(),
});
export type ConformanceInput = z.infer<typeof ConformanceInput>;

/** A persisted conformance check (mirrors `conformance_checks` + the report). */
export const ConformanceReport = z.object({
  id: z.string(),
  pr_id: z.string(),
  report: Conformance,
});
export type ConformanceReport = z.infer<typeof ConformanceReport>;

// ===========================================================================
// Hooks (Secret-Leak + Phantom-API detectors) — emit grounding-exempt findings
// ===========================================================================

export const HookKind = z.enum(['secret_leak', 'phantom']);
export type HookKind = z.infer<typeof HookKind>;

/** Result of running the built-in detectors over a PR. */
export const HookScanResult = z.object({
  pr_id: z.string(),
  review_id: z.string().nullable(),
  findings: z.array(Finding),
});
export type HookScanResult = z.infer<typeof HookScanResult>;

// ===========================================================================
// L06 eval pipeline
// ===========================================================================

export const EvalExpectationType = z.enum(['must_find', 'must_not_flag']);
export type EvalExpectationType = z.infer<typeof EvalExpectationType>;
/** Stored / returned location: already validated. */
export const EvalExpectationLocation = z.object({
  file: z.string().min(1),
  start_line: z.number().int().min(1),
  end_line: z.number().int().min(1),
});
export type EvalExpectationLocation = z.infer<typeof EvalExpectationLocation>;
/** Submitted location: deliberately loose (D-16); the service validates it. */
export const EvalExpectationInput = z.object({
  file: z.string().max(500),
  start_line: z.number(),
  end_line: z.number(),
});
export type EvalExpectationInput = z.infer<typeof EvalExpectationInput>;
export const EvalExpectation = EvalExpectationLocation.extend({
  type: EvalExpectationType,
  severity: z.string(),
  category: z.string(),
  title: z.string(),
});
export type EvalExpectation = z.infer<typeof EvalExpectation>;
export const EvalCasePrMeta = z.object({
  number: z.number().int(),
  title: z.string(),
  body: z.string().nullable(),
  head_sha: z.string(),
});
export type EvalCasePrMeta = z.infer<typeof EvalCasePrMeta>;
export const EvalCaseStatus = z.enum(['passed', 'failed', 'errored']);
export type EvalCaseStatus = z.infer<typeof EvalCaseStatus>;
export const EvalCaseLastResult = z.object({
  run_id: z.string(),
  ran_at: z.string(),
  status: EvalCaseStatus,
  matched: z.number().int(),
  expected: z.number().int(),
  surviving: z.number().int(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  error: z.string().nullable(),
});
export type EvalCaseLastResult = z.infer<typeof EvalCaseLastResult>;
export const EvalCaseDraft = z.object({
  finding_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
  name: z.string(),
  input_diff: z.string(),
  pr: EvalCasePrMeta,
  expectation: EvalExpectation,
  needs_relocation: z.boolean(),
});
export type EvalCaseDraft = z.infer<typeof EvalCaseDraft>;
export const EvalCaseDetail = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
  source_finding_id: z.string().nullable(),
  name: z.string(),
  input_diff: z.string(),
  pr: EvalCasePrMeta,
  expectation: EvalExpectation,
  created_at: z.string(),
  updated_at: z.string(),
  last_result: EvalCaseLastResult.nullable(),
});
export type EvalCaseDetail = z.infer<typeof EvalCaseDetail>;
export const EvalCaseDraftResponse = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('draft'), draft: EvalCaseDraft }),
  z.object({ kind: z.literal('existing'), case: EvalCaseDetail }),
]);
export type EvalCaseDraftResponse = z.infer<typeof EvalCaseDraftResponse>;
export const EvalCaseListItem = EvalCaseDetail.omit({ input_diff: true, pr: true });
export type EvalCaseListItem = z.infer<typeof EvalCaseListItem>;
export const EvalCaseListResponse = z.object({
  agent_id: z.string(),
  cases: z.array(EvalCaseListItem),
  cases_total: z.number().int(),
  cases_passing: z.number().int(),
});
export type EvalCaseListResponse = z.infer<typeof EvalCaseListResponse>;
export const EvalDraftRunRequest = z
  .object({
    finding_id: z.string().uuid().optional(),
    case_id: z.string().uuid().optional(),
    input_diff: z.string().max(200_000),
    expectation: EvalExpectationInput,
  })
  .refine((v) => (v.finding_id ? 1 : 0) + (v.case_id ? 1 : 0) === 1, {
    message: 'Provide exactly one of finding_id or case_id',
    path: ['finding_id'],
  });
export type EvalDraftRunRequest = z.infer<typeof EvalDraftRunRequest>;
export const EvalDraftRunFinding = z.object({
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  severity: z.string(),
  category: z.string(),
  title: z.string(),
  matched: z.boolean(),
});
export type EvalDraftRunFinding = z.infer<typeof EvalDraftRunFinding>;
export const EvalDraftRunResult = z.object({
  expectation_type: EvalExpectationType,
  status: z.enum(['passed', 'failed']),
  matched: z.number().int(),
  expected: z.number().int(),
  findings: z.array(EvalDraftRunFinding),
  pre_gate: z.number().int(),
  post_gate: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
});
export type EvalDraftRunResult = z.infer<typeof EvalDraftRunResult>;
export const EvalCaseCreateRequest = z.object({
  finding_id: z.string().uuid(),
  name: z.string().max(300),
  input_diff: z.string().max(200_000),
  expectation: EvalExpectationInput,
  displayed_type: EvalExpectationType.optional(),
});
export type EvalCaseCreateRequest = z.infer<typeof EvalCaseCreateRequest>;
export const EvalCaseUpdateRequest = z.object({
  name: z.string().max(300),
  input_diff: z.string().max(200_000),
  expectation: EvalExpectationInput,
});
export type EvalCaseUpdateRequest = z.infer<typeof EvalCaseUpdateRequest>;
export const EvalSetRunStatus = z.enum(['running', 'completed', 'failed']);
export type EvalSetRunStatus = z.infer<typeof EvalSetRunStatus>;
export const EvalSkillSnapshot = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number().int(),
});
export type EvalSkillSnapshot = z.infer<typeof EvalSkillSnapshot>;
export const EvalRunCaseRef = z.object({ case_id: z.string(), updated_at: z.string() });
export type EvalRunCaseRef = z.infer<typeof EvalRunCaseRef>;
export const EvalSetRunCaseResult = z.object({
  case_id: z.string(),
  case_name: z.string(),
  expectation_type: EvalExpectationType,
  status: EvalCaseStatus,
  matched: z.number().int(),
  expected: z.number().int(),
  surviving: z.number().int(),
  pre_gate: z.number().int(),
  post_gate: z.number().int(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  error: z.string().nullable(),
});
export type EvalSetRunCaseResult = z.infer<typeof EvalSetRunCaseResult>;
const EvalMetric = z.number().min(0).max(1).nullable(); // not exported
export const EvalSetRunSummary = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
  status: EvalSetRunStatus,
  error: z.string().nullable(),
  agent_version: z.number().int(),
  version_label: z.string(),
  provider: z.string(),
  model: z.string(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  cases_total: z.number().int(),
  cases_done: z.number().int(),
  cases_passed: z.number().int().nullable(),
  cases_errored: z.number().int().nullable(),
  recall: EvalMetric,
  precision: EvalMetric,
  citation_accuracy: EvalMetric,
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalSetRunSummary = z.infer<typeof EvalSetRunSummary>;
export const EvalSetRun = EvalSetRunSummary.extend({
  strategy: z.string(),
  system_prompt: z.string(),
  skills: z.array(EvalSkillSnapshot),
  cases: z.array(EvalRunCaseRef),
  results: z.array(EvalSetRunCaseResult),
});
export type EvalSetRun = z.infer<typeof EvalSetRun>;
export const EvalSetRunStarted = z.object({ run: EvalSetRunSummary, reused: z.boolean() });
export type EvalSetRunStarted = z.infer<typeof EvalSetRunStarted>;
export const EvalMetricDeltas = z.object({
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
});
export type EvalMetricDeltas = z.infer<typeof EvalMetricDeltas>;
export const EvalAgentRef = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  model: z.string(),
  version: z.number().int(),
});
export type EvalAgentRef = z.infer<typeof EvalAgentRef>;
export const EvalAgentRunsResponse = z.object({
  agent: EvalAgentRef,
  cases_total: z.number().int(),
  active_run: EvalSetRunSummary.nullable(),
  latest_completed: EvalSetRunSummary.nullable(),
  previous_completed: EvalSetRunSummary.nullable(),
  delta: EvalMetricDeltas.nullable(),
  runs: z.array(EvalSetRunSummary), // newest first, all statuses
});
export type EvalAgentRunsResponse = z.infer<typeof EvalAgentRunsResponse>;
export const EvalRunCompare = z.object({
  base: EvalSetRun,
  head: EvalSetRun, // base = older, head = newer, whatever the request order
  delta: EvalMetricDeltas.extend({ cost_usd: z.number().nullable() }),
  prompt_changed: z.boolean(),
  model_changed: z.boolean(),
  skills_changed: z.boolean(),
  cases_only_in_base: z.array(z.string()),
  cases_only_in_head: z.array(z.string()),
  cases_edited: z.array(z.string()),
  comparable: z.boolean(),
});
export type EvalRunCompare = z.infer<typeof EvalRunCompare>;
export const EvalAgentSummary = z.object({
  agent: EvalAgentRef,
  cases_total: z.number().int(),
  latest_completed: EvalSetRunSummary.nullable(),
});
export type EvalAgentSummary = z.infer<typeof EvalAgentSummary>;
export const EvalDashboardIndex = z.object({
  agents: z.array(EvalAgentSummary),
  recent_runs: z.array(EvalSetRunSummary),
});
export type EvalDashboardIndex = z.infer<typeof EvalDashboardIndex>;
