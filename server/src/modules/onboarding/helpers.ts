/**
 * Pure helpers for the onboarding module — deterministic fact builders,
 * ranking, LLM-boundary sanitisation/merge, DTO mapping. No I/O, no clock, no
 * randomness (callers pass timings). Structurally typed against `./types.js`
 * so it stays a leaf — `.dependency-cruiser.cjs`'s `helpers-and-constants-are-pure`.
 */
import {
  OnboardingSkeletonReason,
  OnboardingTourContent,
  type CommitChurn,
  type OnboardingCommand,
  type OnboardingDirFact,
  type OnboardingFactComponent,
  type OnboardingIndexSummary,
  type OnboardingPackageManager,
  type OnboardingReadingItem,
  type OnboardingTour,
} from '@devdigest/shared';
import { ConfigError, ExternalServiceError } from '../../platform/errors.js';
import { TimeoutError } from '../../platform/resilience.js';
import {
  LOCKFILES,
  MAX_COMMENT_CHARS,
  MAX_CRITICAL_PATHS,
  MAX_DEPS_PER_MANIFEST,
  MAX_DIAGRAM_CHARS,
  MAX_FIRST_TASKS,
  MAX_READING_PATH,
  MAX_RUN_COMMANDS,
  MAX_SCRIPTS_PER_MANIFEST,
  MIN_CRITICAL_CHAINS,
  RUN_SCRIPT_PREFERENCE,
  SAFE_DIR_RE,
  SCRIPT_NAME_RE,
} from './constants.js';
import type { OnboardingLlmOutput } from './schemas.js';
import type {
  BudgetedFacts,
  DirCountLike,
  FactsComponent,
  GenerationLogInput,
  IndexStateLike,
  ManifestFact,
  ManifestFacts,
  ManifestSkip,
  OnboardingRow,
  PageRankLike,
  SkeletonInput,
} from './types.js';

// ---------------------------------------------------------------------------
// Structure (AC-8)
// ---------------------------------------------------------------------------

/** Sort by file count desc, then dir asc; cap at `max`. */
export function selectStructure(rows: DirCountLike[], max: number): OnboardingDirFact[] {
  return [...rows]
    .sort((a, b) => b.files - a.files || (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0))
    .slice(0, max)
    .map((r) => ({ dir: r.dir, files: r.files }));
}

/** A directory name safe to interpolate into a manifest path (`<dir>/package.json`). */
export function isSafeDirName(dir: string): boolean {
  return dir !== '.' && dir !== '..' && SAFE_DIR_RE.test(dir);
}

// ---------------------------------------------------------------------------
// Manifests (AC-9, AC-10)
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Parse one `package.json` blob. `raw === null` means the file is missing. */
export function parseManifest(
  path: string,
  raw: string | null,
  maxBytes: number,
): { fact: ManifestFact } | { skip: ManifestSkip } {
  if (raw === null) return { skip: { path, reason: 'missing' } };
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) return { skip: { path, reason: 'too_large' } };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { skip: { path, reason: 'invalid_json' } };
  }
  if (!isPlainObject(parsed)) return { skip: { path, reason: 'invalid_json' } };

  const deps: string[] = [];
  const seen = new Set<string>();
  for (const key of ['dependencies', 'devDependencies'] as const) {
    const block = parsed[key];
    if (!isPlainObject(block)) continue;
    for (const name of Object.keys(block)) {
      if (seen.has(name)) continue;
      seen.add(name);
      deps.push(name);
    }
  }
  const scripts = isPlainObject(parsed.scripts) ? Object.keys(parsed.scripts) : [];
  return {
    fact: {
      path,
      name: typeof parsed.name === 'string' ? parsed.name : null,
      dependencies: deps.slice(0, MAX_DEPS_PER_MANIFEST),
      scripts: scripts.slice(0, MAX_SCRIPTS_PER_MANIFEST),
    },
  };
}

/** Lockfile → package manager, in `LOCKFILES` order; defaults to npm. */
export function detectPackageManager(present: Record<string, boolean>): OnboardingPackageManager {
  for (const [file, pm] of LOCKFILES) {
    if (present[file]) return pm;
  }
  return 'npm';
}

/** AC-48: only names matching `SCRIPT_NAME_RE` may become a displayed command. */
export function isSafeScriptName(name: string): boolean {
  return SCRIPT_NAME_RE.test(name);
}

// ---------------------------------------------------------------------------
// Run locally (AC-16) / critical paths (AC-15)
// ---------------------------------------------------------------------------

export function buildRunCommands(facts: ManifestFacts): OnboardingCommand[] {
  const pm = facts.packageManager;
  const cmds: string[] = [`${pm} install`];
  if (facts.hasEnvExample) cmds.push('cp .env.example .env');
  if (facts.hasCompose) cmds.push('docker compose up -d');
  const runScript = RUN_SCRIPT_PREFERENCE.find((s) => facts.rootScripts.includes(s) && isSafeScriptName(s));
  if (runScript) cmds.push(`${pm} run ${runScript}`);
  if (facts.rootScripts.includes('test') && isSafeScriptName('test')) cmds.push(`${pm} run test`);
  return cmds.slice(0, MAX_RUN_COMMANDS).map((command) => ({ command, comment: null }));
}

/**
 * Flatten chains, dedupe by first occurrence, cap at `max`. Top up from
 * `topFiles` only when there are fewer than `minChains` chains.
 */
export function buildCriticalPathList(
  chains: string[][],
  topFiles: string[],
  max: number = MAX_CRITICAL_PATHS,
  minChains: number = MIN_CRITICAL_CHAINS,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (p: string): void => {
    if (out.length >= max || seen.has(p)) return;
    seen.add(p);
    out.push(p);
  };
  for (const chain of chains) for (const p of chain) push(p);
  if (chains.length < minChains) for (const p of topFiles) push(p);
  return out;
}

// ---------------------------------------------------------------------------
// Ranking (AC-11..AC-13)
// ---------------------------------------------------------------------------

/** `ln(1+c)/ln(1+max)` over indexed paths only. Null churn or max 0 → empty map (read as 0). */
export function computeHotness(churn: CommitChurn | null, indexed: Set<string>): Map<string, number> {
  const out = new Map<string, number>();
  if (!churn) return out;
  let max = 0;
  for (const [path, count] of Object.entries(churn.byPath)) {
    if (indexed.has(path) && count > max) max = count;
  }
  if (max <= 0) return out;
  const denom = Math.log(1 + max);
  for (const [path, count] of Object.entries(churn.byPath)) {
    if (indexed.has(path)) out.set(path, Math.log(1 + count) / denom);
  }
  return out;
}

/** `score = pagerank × (1 + hotness)`, desc, ties by path asc, capped. */
export function rankReadingPath(
  candidates: PageRankLike[],
  hotness: Map<string, number>,
  max: number = MAX_READING_PATH,
): OnboardingReadingItem[] {
  return candidates
    .map((c) => ({ path: c.path, rationale: null, score: c.pagerank * (1 + (hotness.get(c.path) ?? 0)) }))
    .sort((a, b) => b.score - a.score || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .slice(0, max);
}

/** Union of dependency names across manifests, in insertion order (root manifest first). */
export function buildStack(manifests: ManifestFact[]): string[] {
  const root = manifests.filter((m) => m.path === 'package.json');
  const rest = manifests.filter((m) => m.path !== 'package.json');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of [...root, ...rest]) {
    for (const d of m.dependencies) {
      if (seen.has(d)) continue;
      seen.add(d);
      out.push(d);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// LLM boundary (AC-18, AC-19, AC-21, AC-22, AC-49)
// ---------------------------------------------------------------------------

function totalChars(blocks: { label: string; text: string }[]): number {
  return blocks.reduce((n, b) => n + b.label.length + b.text.length, 0);
}

/**
 * Drop components in `dropOrder` until the payload fits `maxChars`. A dropped
 * component with a `fallback` is swapped for it; otherwise it is removed.
 */
export function budgetFactsPayload(
  components: FactsComponent[],
  maxChars: number,
  dropOrder: readonly OnboardingFactComponent[],
): BudgetedFacts {
  const current: Array<FactsComponent & { active: FactsComponent['block'] | null }> = components.map((c) => ({
    ...c,
    active: c.block,
  }));
  const dropped: OnboardingFactComponent[] = [];
  const measure = (): number => totalChars(current.flatMap((c) => (c.active ? [c.active] : [])));

  for (const kind of dropOrder) {
    if (measure() <= maxChars) break;
    const target = current.find((c) => c.component === kind && c.active !== null);
    if (!target) continue;
    target.active = target.fallback ?? null;
    dropped.push(kind);
  }
  const blocks = current.flatMap((c) => (c.active ? [c.active] : []));
  return { blocks, chars: totalChars(blocks), dropped };
}

/** Single line, no control chars, collapsed whitespace, capped; empty → null (AC-49). */
export function sanitizeComment(raw: string, maxChars: number): string | null {
  const cleaned = raw
    .replace(/[\p{Cc}\r\n]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars)
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

/** `[x](y)` → `x`, so prose can never render a link (R-4). */
export function stripMarkdownLinks(prose: string): string {
  return prose.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');
}

function normalizeCitedPath(p: string): string {
  return p.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

/**
 * Fold the LLM annotations into the deterministic skeleton. Annotations only
 * ever decorate existing items: unknown keys are dropped, missing ones stay
 * null, and no deterministic item is added, removed or reordered (AC-18).
 */
export function mergeAnnotations(
  skeleton: OnboardingTourContent,
  llm: OnboardingLlmOutput,
  known: { indexedPaths: Set<string>; dirs: Set<string> },
): OnboardingTourContent {
  const reasonByPath = new Map<string, string>();
  for (const r of llm.reasons) if (!reasonByPath.has(r.path)) reasonByPath.set(r.path, r.reason);
  const rationaleByPath = new Map<string, string>();
  for (const r of llm.rationales) if (!rationaleByPath.has(r.path)) rationaleByPath.set(r.path, r.rationale);
  const commentByIndex = new Map<number, string>();
  for (const c of llm.comments) if (!commentByIndex.has(c.index)) commentByIndex.set(c.index, c.comment);

  const prose = stripMarkdownLinks(llm.architecture.prose).trim();
  const diagramRaw = llm.architecture.diagram?.trim() ?? '';
  const diagram = diagramRaw.length > 0 && diagramRaw.length <= MAX_DIAGRAM_CHARS ? diagramRaw : null;

  const firstTasks = llm.first_tasks
    .map((t) => ({ title: t.title.trim(), detail: t.detail.trim(), paths: t.paths.map(normalizeCitedPath), complexity: t.complexity }))
    .filter(
      (t) =>
        t.title.length > 0 &&
        t.paths.every((p) => known.indexedPaths.has(p) || known.dirs.has(p)),
    )
    .slice(0, MAX_FIRST_TASKS);

  const [arch, critical, run, reading, tasks] = skeleton.sections;
  return {
    ...skeleton,
    sections: [
      { ...arch, prose: prose.length > 0 ? prose : null, diagram },
      {
        ...critical,
        items: critical.items.map((it) => {
          const raw = reasonByPath.get(it.path);
          return { ...it, reason: raw === undefined ? null : sanitizeComment(raw, MAX_COMMENT_CHARS) };
        }),
      },
      {
        ...run,
        items: run.items.map((it, i) => {
          const raw = commentByIndex.get(i);
          return { ...it, comment: raw === undefined ? null : sanitizeComment(raw, MAX_COMMENT_CHARS) };
        }),
      },
      {
        ...reading,
        items: reading.items.map((it) => {
          const raw = rationaleByPath.get(it.path);
          return { ...it, rationale: raw === undefined ? null : sanitizeComment(raw, MAX_COMMENT_CHARS) };
        }),
      },
      { ...tasks, items: firstTasks },
    ],
  };
}

// ---------------------------------------------------------------------------
// Skeleton, error classification, DTOs, log
// ---------------------------------------------------------------------------

/** All five sections from deterministic facts alone; never any LLM text (AC-26, AC-32). */
export function buildSkeletonContent(input: SkeletonInput): OnboardingTourContent {
  return {
    sections: [
      { kind: 'architecture', prose: null, diagram: null, structure: input.structure, stack: input.stack },
      { kind: 'critical_paths', items: input.criticalPaths.map((path) => ({ path, reason: null })) },
      { kind: 'run_locally', package_manager: input.packageManager, items: input.commands },
      { kind: 'reading_path', ranking: input.ranking, items: input.reading },
      { kind: 'first_tasks', items: [] },
    ],
    index_partial: input.indexPartial,
    files_indexed: input.filesIndexed,
    ranking: input.ranking,
    dropped_components: input.droppedComponents,
    error_class: input.errorClass,
  };
}

/** Map a thrown LLM error to a skeleton reason + sanitised class — never the raw message. */
export function classifyLlmError(err: unknown): {
  reason: 'llm_failed' | 'llm_invalid_output';
  errorClass: string;
} {
  if (err instanceof TimeoutError) return { reason: 'llm_failed', errorClass: 'timeout' };
  if (err instanceof ExternalServiceError && err.message.includes('schema validation')) {
    return { reason: 'llm_invalid_output', errorClass: 'invalid_output' };
  }
  if (err instanceof ConfigError) return { reason: 'llm_failed', errorClass: 'missing_api_key' };
  return { reason: 'llm_failed', errorClass: 'provider_error' };
}

/** Row → DTO. Parses the stored JSON (S-9) and maps every Date to ISO. */
export function toTourDto(row: OnboardingRow, currentSha: string | null): OnboardingTour {
  const content = OnboardingTourContent.parse(row.json);
  return {
    ...content,
    status: row.status,
    reason: row.reason === null ? null : OnboardingSkeletonReason.parse(row.reason),
    index_sha: row.indexSha,
    generated_at: row.generatedAt.toISOString(),
    stale: !!(row.indexSha && currentSha && row.indexSha !== currentSha),
    provider: row.provider,
    model: row.model,
    llm_calls: row.llmCalls,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    cost_usd: row.costUsd,
  };
}

export function toIndexSummary(state: IndexStateLike): OnboardingIndexSummary {
  return {
    status: state.status,
    files_indexed: state.filesIndexed,
    last_indexed_sha: state.lastIndexedSha === '' ? null : state.lastIndexedSha,
    updated_at: state.updatedAt.toISOString(),
    partial: state.status === 'partial',
  };
}

/** Exactly the AC-34 keys plus `manifest_skips` and `error_class`. No prompt/README text (S-19). */
export function buildGenerationLogFields(input: GenerationLogInput): Record<string, unknown> {
  const o = input.outcome;
  return {
    workspace_id: input.workspaceId,
    repo_id: input.repoId,
    index_sha: o.indexSha,
    status: o.status,
    reason: o.reason,
    provider: o.provider,
    model: o.model,
    llm_calls: o.llmCalls,
    tokens_in: o.tokensIn,
    tokens_out: o.tokensOut,
    cost_usd: o.costUsd,
    facts_chars: o.factsChars,
    dropped_components: o.content.dropped_components,
    ranking: o.content.ranking,
    duration_ms: input.durationMs,
    manifest_skips: o.manifestSkips,
    error_class: o.content.error_class,
  };
}
