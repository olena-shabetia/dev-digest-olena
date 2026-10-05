import { z } from 'zod';

/**
 * Conformance, Onboarding, Eval, Memory, Conventions, Skills,
 * Agents and their DTOs.
 */

// ---- Conformance ----
export const ConformanceStatus = z.enum(['implemented', 'missing', 'out_of_scope']);
export type ConformanceStatus = z.infer<typeof ConformanceStatus>;

export const ConformanceItem = z.object({
  requirement: z.string(),
  status: ConformanceStatus,
  evidence_file: z.string().nullish(),
  notes: z.string().nullish(),
});
export type ConformanceItem = z.infer<typeof ConformanceItem>;

export const Conformance = z.object({
  spec_id: z.string(),
  spec_title: z.string(),
  items: z.array(ConformanceItem),
  completeness_pct: z.number().min(0).max(100),
});
export type Conformance = z.infer<typeof Conformance>;

// ---- Onboarding (L05b tour) ----
export const OnboardingSectionKind = z.enum(['architecture', 'critical_paths', 'run_locally', 'reading_path', 'first_tasks']);
export type OnboardingSectionKind = z.infer<typeof OnboardingSectionKind>;
export const OnboardingTourStatus = z.enum(['ready', 'skeleton']);
export type OnboardingTourStatus = z.infer<typeof OnboardingTourStatus>;
export const OnboardingSkeletonReason = z.enum(['flag_off', 'not_cloned', 'index_missing', 'index_degraded', 'llm_failed', 'llm_invalid_output']);
export type OnboardingSkeletonReason = z.infer<typeof OnboardingSkeletonReason>;
export const OnboardingRanking = z.enum(['graph_and_history', 'graph_only']);
export type OnboardingRanking = z.infer<typeof OnboardingRanking>;
export const OnboardingFactComponent = z.enum(['readme', 'endpoints', 'repo_map', 'dependencies']);
export type OnboardingFactComponent = z.infer<typeof OnboardingFactComponent>;
export const OnboardingState = z.enum(['none', 'generating', 'ready', 'skeleton']);
export type OnboardingState = z.infer<typeof OnboardingState>;
export const OnboardingPackageManager = z.enum(['pnpm', 'yarn', 'npm']);
export type OnboardingPackageManager = z.infer<typeof OnboardingPackageManager>;

export const OnboardingDirFact = z.object({ dir: z.string(), files: z.number().int() });
export type OnboardingDirFact = z.infer<typeof OnboardingDirFact>;
export const OnboardingCriticalPath = z.object({ path: z.string(), reason: z.string().nullable() });
export type OnboardingCriticalPath = z.infer<typeof OnboardingCriticalPath>;
export const OnboardingCommand = z.object({ command: z.string(), comment: z.string().nullable() });
export type OnboardingCommand = z.infer<typeof OnboardingCommand>;
export const OnboardingReadingItem = z.object({ path: z.string(), rationale: z.string().nullable(), score: z.number() });
export type OnboardingReadingItem = z.infer<typeof OnboardingReadingItem>;
export const OnboardingComplexity = z.enum(['low', 'medium', 'high']);
export type OnboardingComplexity = z.infer<typeof OnboardingComplexity>;
export const OnboardingFirstTask = z.object({ title: z.string(), detail: z.string(), paths: z.array(z.string()), complexity: OnboardingComplexity });
export type OnboardingFirstTask = z.infer<typeof OnboardingFirstTask>;

export const OnboardingArchitectureSection = z.object({
  kind: z.literal('architecture'),
  prose: z.string().nullable(),
  diagram: z.string().nullable(),
  structure: z.array(OnboardingDirFact),
  stack: z.array(z.string()),
});
export type OnboardingArchitectureSection = z.infer<typeof OnboardingArchitectureSection>;
export const OnboardingCriticalPathsSection = z.object({ kind: z.literal('critical_paths'), items: z.array(OnboardingCriticalPath) });
export type OnboardingCriticalPathsSection = z.infer<typeof OnboardingCriticalPathsSection>;
export const OnboardingRunLocallySection = z.object({
  kind: z.literal('run_locally'),
  package_manager: OnboardingPackageManager.nullable(),
  items: z.array(OnboardingCommand),
});
export type OnboardingRunLocallySection = z.infer<typeof OnboardingRunLocallySection>;
export const OnboardingReadingPathSection = z.object({
  kind: z.literal('reading_path'),
  ranking: OnboardingRanking,
  items: z.array(OnboardingReadingItem),
});
export type OnboardingReadingPathSection = z.infer<typeof OnboardingReadingPathSection>;
export const OnboardingFirstTasksSection = z.object({ kind: z.literal('first_tasks'), items: z.array(OnboardingFirstTask) }); // [] on every skeleton
export type OnboardingFirstTasksSection = z.infer<typeof OnboardingFirstTasksSection>;

export const OnboardingSection = z.discriminatedUnion('kind', [
  OnboardingArchitectureSection,
  OnboardingCriticalPathsSection,
  OnboardingRunLocallySection,
  OnboardingReadingPathSection,
  OnboardingFirstTasksSection,
]);
export type OnboardingSection = z.infer<typeof OnboardingSection>;
export const OnboardingSections = z.tuple([
  OnboardingArchitectureSection,
  OnboardingCriticalPathsSection,
  OnboardingRunLocallySection,
  OnboardingReadingPathSection,
  OnboardingFirstTasksSection,
]);
export type OnboardingSections = z.infer<typeof OnboardingSections>;

/** What is persisted in onboarding.json (parsed on read, S-9). */
export const OnboardingTourContent = z.object({
  sections: OnboardingSections,
  index_partial: z.boolean(),
  files_indexed: z.number().int(),
  ranking: OnboardingRanking,
  dropped_components: z.array(OnboardingFactComponent),
  error_class: z.string().nullable(),
});
export type OnboardingTourContent = z.infer<typeof OnboardingTourContent>;

/** Tour DTO = content + row meta + read-time stale flag. */
export const OnboardingTour = OnboardingTourContent.extend({
  status: OnboardingTourStatus,
  reason: OnboardingSkeletonReason.nullable(),
  index_sha: z.string().nullable(),
  generated_at: z.string(), // ISO
  stale: z.boolean(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  llm_calls: z.number().int().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type OnboardingTour = z.infer<typeof OnboardingTour>;

export const OnboardingIndexSummary = z.object({
  status: z.enum(['full', 'partial', 'degraded', 'failed']),
  files_indexed: z.number().int(),
  last_indexed_sha: z.string().nullable(), // '' from getIndexState -> null
  updated_at: z.string(), // ISO
  partial: z.boolean(), // status === 'partial'
});
export type OnboardingIndexSummary = z.infer<typeof OnboardingIndexSummary>;

export const OnboardingTourResponse = z.object({
  state: OnboardingState,
  tour: OnboardingTour.nullable(),
  index: OnboardingIndexSummary,
});
export type OnboardingTourResponse = z.infer<typeof OnboardingTourResponse>;
export const OnboardingGenerateAccepted = z.object({ job_id: z.string(), reused: z.boolean() });
export type OnboardingGenerateAccepted = z.infer<typeof OnboardingGenerateAccepted>;

// ---- Eval ----
export const EvalPerTrace = z.object({
  name: z.string(),
  pass: z.boolean(),
  expected: z.unknown(),
  actual: z.unknown(),
});
export type EvalPerTrace = z.infer<typeof EvalPerTrace>;

export const EvalRun = z.object({
  recall: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  citation_accuracy: z.number().min(0).max(1),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  per_trace: z.array(EvalPerTrace),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

export const EvalCase = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_files: z.unknown(),
  input_meta: z.unknown(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCase = z.infer<typeof EvalCase>;

// ---- Memory ----
export const MemoryScope = z.enum(['repo', 'global', 'team']);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryKind = z.enum([
  'decision',
  'convention',
  'preference',
  'fact',
  'learning',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
});
export type MemorySource = z.infer<typeof MemorySource>;

export const MemoryItem = z.object({
  content: z.string(),
  scope: MemoryScope,
  kind: MemoryKind,
  confidence: z.number().min(0).max(1),
  sources: z.array(MemorySource),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

// ---- Skills ----
export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

export const SkillSource = z.enum(['manual', 'imported_url', 'extracted', 'community']);
export type SkillSource = z.infer<typeof SkillSource>;

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  evidence_files: z.array(z.string()).nullish(),
  /**
   * List-view usage aggregates (HW2 criteria 22-24) — populated by `GET
   * /skills` only; omitted (never a fabricated 0) on the single-skill
   * routes (`GET`/`POST`/`PUT /skills/:id`), which don't pay for the extra
   * aggregate query. `agent_count` is exact (an `agent_skills` count).
   * `pull_freq`/`accept_rate` are an approximation: there is no per-run
   * skill-attribution table (see `SkillStats`'s doc comment), so they're
   * derived from the skill's CURRENTLY linked agents' historical review
   * runs — a proxy for "was this skill in the prompt", not a true per-run
   * join. `null` when the denominator (reviews / findings) is zero.
   */
  agent_count: z.number().int().nullish(),
  pull_freq: z.number().min(0).max(1).nullable().optional(),
  accept_rate: z.number().min(0).max(1).nullable().optional(),
});
export type Skill = z.infer<typeof Skill>;

export const CommunitySkill = z.object({
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

/**
 * Parsed-but-not-saved result of `POST /skills/import/preview` (a single
 * `.md`/`.markdown` file, or the picked core of a `.zip`). Nothing is written
 * to the DB until the client confirms with a normal `POST /skills`.
 * `ignored_entries`/`executable_entries` are archive entries that were listed
 * but never read, written, or executed — the on-camera proof of the trust
 * story (see specs/L02-skills.md).
 */
export const SkillImportPreview = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  source_filename: z.string(),
  ignored_entries: z.array(z.string()),
  executable_entries: z.array(z.string()),
});
export type SkillImportPreview = z.infer<typeof SkillImportPreview>;

/**
 * One immutable snapshot of a skill's body (`skill_versions`, GET
 * /skills/:id/versions, newest first). Simpler than `AgentVersion` — a skill
 * version stores only a body, never a JSON config blob, so there's no
 * malformed-snapshot `.safeParse` concern the way `AgentVersionConfig` has.
 */
export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  body: z.string(),
  /** Optional human note captured at save time, e.g. "Tightened scope rule". */
  change_note: z.string().nullable(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

/**
 * GET /skills/:id/stats. Deliberately small: only "which agents use this
 * skill" is backed by real data today (a plain `agent_skills` join). Pull
 * frequency / accept rate / findings-by-category need a per-run
 * skill-attribution table that doesn't exist yet — see specs/L02-skills.md.
 */
export const SkillStats = z.object({
  skill_id: z.string(),
  agents_using: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type SkillStats = z.infer<typeof SkillStats>;

// ---- Conventions ----
export const ConventionCategory = z.enum([
  'naming',
  'structure',
  'error-handling',
  'testing',
  'imports',
  'typing',
  'async',
  'styling',
  'other',
]);
export type ConventionCategory = z.infer<typeof ConventionCategory>;

export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

/** One verified occurrence of a candidate rule. `url` is derived (never
 *  stored) from `sha`+`line`; `null` when either is missing. */
export const ConventionEvidence = z.object({
  path: z.string(),
  line: z.number().int().nullable(),
  snippet: z.string(),
  sha: z.string().nullable(),
  url: z.string().nullable(),
});
export type ConventionEvidence = z.infer<typeof ConventionEvidence>;

/**
 * A candidate house-rule proposed by the extractor and code-verified against
 * the clone. `evidence_*` (flat) mirrors `evidences[0]` (the highest-ranked
 * occurrence) so simple reads/sorts don't need to unpack the array;
 * `evidences` carries every verified occurrence, primary first, capped at 5.
 */
export const ConventionCandidate = z.object({
  id: z.string(),
  repo_id: z.string(),
  scan_id: z.string().nullable(),
  category: ConventionCategory,
  rule: z.string(),
  evidence_path: z.string(),
  evidence_line: z.number().int().nullable(),
  evidence_snippet: z.string(),
  evidence_sha: z.string().nullable(),
  evidence_url: z.string().nullable(),
  evidences: z.array(ConventionEvidence),
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
  edited: z.boolean(),
  created_at: z.string(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

/** One extraction run (`POST /repos/:id/conventions/extract`), restart-durable
 *  so the UI can report proposed-vs-verified counts after a reload. */
export const ConventionScan = z.object({
  id: z.string(),
  repo_id: z.string(),
  status: z.enum(['queued', 'running', 'done', 'failed']),
  sha: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  candidates_proposed: z.number().int(),
  candidates_verified: z.number().int(),
  degraded: z.boolean(),
  degraded_reason: z.string().nullable(),
  created_at: z.string(),
});
export type ConventionScan = z.infer<typeof ConventionScan>;

// ---- Agents ----
// 'openrouter' routes through the OpenAI-compatible API (OpenAIProvider with a
// custom baseURL) — used by the CI runner for cheap models (DeepSeek/GLM/MiniMax).
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a review should BLOCK (REQUEST_CHANGES + fail the check)
// vs just comment. Deterministic from finding severities, NOT the model's verdict:
//  - never:    never block, always comment (advisory only)
//  - critical: block iff >=1 CRITICAL finding (default)
//  - warning:  block iff >=1 WARNING or CRITICAL finding
//  - any:      block iff >=1 finding of any severity
export const CiFailOn = z.enum(['never', 'critical', 'warning', 'any']);
export type CiFailOn = z.infer<typeof CiFailOn>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  version: z.number().int(),
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;

// The immutable config snapshot captured in `agent_versions` whenever an agent's
// config changes (everything but `enabled`). Mirrors the shape written by the
// agents repository — provider/model/prompt/output_schema/strategy/gate/repo_intel
// plus the ordered skill ids linked at snapshot time. Used for reproducibility
// (eval replays a past version) and for surfacing an agent's edit history.
export const AgentVersionConfig = z.object({
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  strategy: ReviewStrategy,
  ci_fail_on: CiFailOn,
  repo_intel: z.boolean(),
  skills: z.array(z.string()),
});
export type AgentVersionConfig = z.infer<typeof AgentVersionConfig>;

export const AgentVersion = z.object({
  agent_id: z.string(),
  version: z.number().int(),
  config: AgentVersionConfig,
  created_at: z.string(),
});
export type AgentVersion = z.infer<typeof AgentVersion>;
