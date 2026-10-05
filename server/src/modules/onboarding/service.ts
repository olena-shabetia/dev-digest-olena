import {
  FEATURE_MODELS,
  OnboardingTourContent,
  type CommitChurn,
  type OnboardingCommand,
  type OnboardingDirFact,
  type OnboardingGenerateAccepted,
  type OnboardingReadingItem,
  type OnboardingSkeletonReason,
  type OnboardingTourResponse,
  type RepoRef,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { withTimeout } from '../../platform/resilience.js';
import { OnboardingRepository } from './repository.js';
import { buildOnboardingMessages } from './prompt.js';
import { OnboardingLlmOutput } from './schemas.js';
import {
  buildCriticalPathList,
  buildGenerationLogFields,
  buildRunCommands,
  buildSkeletonContent,
  buildStack,
  budgetFactsPayload,
  classifyLlmError,
  computeHotness,
  detectPackageManager,
  isSafeDirName,
  mergeAnnotations,
  parseManifest,
  rankReadingPath,
  selectStructure,
  toIndexSummary,
  toTourDto,
} from './helpers.js';
import {
  COMPOSE_FILES,
  FACT_DROP_ORDER,
  HISTORY_TIMEOUT_MS,
  HOTNESS_MAX_COMMITS,
  HOTNESS_WINDOW_DAYS,
  INFLIGHT_STALE_MS,
  LLM_ATTEMPT_TIMEOUT_MS,
  LLM_MAX_RETRIES,
  LOCKFILES,
  MAX_CRITICAL_PATHS,
  MAX_ENDPOINTS,
  MAX_FACTS_CHARS,
  MAX_MANIFEST_BYTES,
  MAX_MANIFESTS,
  MAX_OUTPUT_TOKENS,
  MAX_README_CHARS,
  MAX_STRUCTURE_DIRS,
  ONBOARDING_GENERATE_JOB_KIND,
  ONBOARDING_LLM_DEADLINE_MS,
  ONBOARDING_SCHEMA_NAME,
  README_CANDIDATES,
  READING_POOL_SIZE,
} from './constants.js';
import type {
  FactsComponent,
  GenerationOutcome,
  IndexStateLike,
  ManifestFact,
  ManifestFacts,
  ManifestSkip,
  OnboardingLogger,
  OnboardingRow,
} from './types.js';

/** Cap on churned paths sent to the indexed-path check (keeps the IN list bounded). */
const MAX_CHURN_PATHS = 2000;
/** Cap on distinct paths cited by first tasks that are checked against the index. */
const MAX_CITED_PATHS = 200;

type GenerateResult = { jobId: string; reused: boolean };

interface CollectedFacts {
  structure: OnboardingDirFact[];
  manifests: ManifestFacts;
  manifestFacts: ManifestFact[];
  readme: string | null;
  criticalPaths: string[];
  reading: OnboardingReadingItem[];
  ranking: 'graph_and_history' | 'graph_only';
  commands: OnboardingCommand[];
}

/**
 * L05b — onboarding tour. Business logic only, zero SQL. Every repo-intel /
 * git read is best-effort and degrades to "no data"; the single LLM call is
 * bounded by an overall deadline (D-9) and its failure yields a skeleton, never
 * a thrown job (AC-33).
 */
export class OnboardingService {
  private repo: OnboardingRepository;
  /** Collapses concurrent POSTs in this process before the jobs row exists (R-7). */
  private pending = new Map<string, Promise<GenerateResult>>();

  constructor(
    private container: Container,
    private log: OnboardingLogger,
  ) {
    this.repo = new OnboardingRepository(container.db);
  }

  /** Register the generation job handler once at app boot (routes.ts). */
  registerGenerateJobHandler(): void {
    this.container.jobs.register(ONBOARDING_GENERATE_JOB_KIND, async (payload) => {
      const p = payload as { workspaceId: string; repoId: string };
      try {
        await this.runGeneration(p.workspaceId, p.repoId);
      } catch (err) {
        // Never rethrow (AC-33): JobRunner would retry and double-spend tokens.
        this.log.warn(
          {
            workspace_id: p.workspaceId,
            repo_id: p.repoId,
            error_class: err instanceof Error ? err.name : 'unknown',
          },
          'onboarding.generation.failed',
        );
      }
    });
  }

  /** GET /repos/:id/onboarding — pure DB read plus the live index state. */
  async getTour(workspaceId: string, repoId: string): Promise<OnboardingTourResponse> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const index = toIndexSummary(await this.container.repoIntel.getIndexState(repoId));
    const inflight = await this.repo.findInflightJob(
      workspaceId,
      repoId,
      new Date(Date.now() - INFLIGHT_STALE_MS),
    );

    let row: OnboardingRow | undefined = await this.repo.getTour(workspaceId, repoId);
    if (row && !OnboardingTourContent.safeParse(row.json).success) {
      this.log.warn({ workspace_id: workspaceId, repo_id: repoId }, 'onboarding.tour.unreadable');
      row = undefined; // S-9: an unparseable row is treated as absent
    }

    const state = inflight ? 'generating' : row ? row.status : 'none';
    const tour = row ? toTourDto(row, index.last_indexed_sha) : null;
    return { state, tour, index };
  }

  /** POST /repos/:id/onboarding/generate — enqueue, or reuse the in-flight job. */
  async generate(workspaceId: string, repoId: string): Promise<OnboardingGenerateAccepted> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const key = `${workspaceId}:${repoId}`;
    const existing = this.pending.get(key);
    if (existing) {
      const r = await existing;
      return { job_id: r.jobId, reused: true };
    }
    const started = this.enqueueOrReuse(workspaceId, repoId);
    this.pending.set(key, started);
    try {
      const r = await started;
      return { job_id: r.jobId, reused: r.reused };
    } finally {
      this.pending.delete(key);
    }
  }

  private async enqueueOrReuse(workspaceId: string, repoId: string): Promise<GenerateResult> {
    const inflight = await this.repo.findInflightJob(
      workspaceId,
      repoId,
      new Date(Date.now() - INFLIGHT_STALE_MS),
    );
    if (inflight) return { jobId: inflight.id, reused: true };
    const job = await this.container.jobs.enqueue(workspaceId, ONBOARDING_GENERATE_JOB_KIND, {
      workspaceId,
      repoId,
    });
    job.done.catch(() => undefined); // failures are recorded on the jobs row
    return { jobId: job.id, reused: false };
  }

  // -------------------------------------------------------------------------
  // Generation
  // -------------------------------------------------------------------------

  async runGeneration(workspaceId: string, repoId: string): Promise<void> {
    const startedAt = Date.now();
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) {
      this.log.warn(
        { workspace_id: workspaceId, repo_id: repoId, reason: 'repo_missing' },
        'onboarding.generation.skipped',
      );
      return;
    }

    const finish = async (outcome: GenerationOutcome): Promise<void> => {
      await this.repo.upsertTour(workspaceId, repoId, {
        status: outcome.status,
        reason: outcome.reason,
        content: outcome.content,
        indexSha: outcome.indexSha,
        provider: outcome.provider,
        model: outcome.model,
        llmCalls: outcome.llmCalls,
        tokensIn: outcome.tokensIn,
        tokensOut: outcome.tokensOut,
        costUsd: outcome.costUsd,
      });
      this.emitLog(workspaceId, repoId, outcome, Date.now() - startedAt);
    };

    // --- Zero-call skeleton branches -----------------------------------------
    if (!this.container.config.repoIntelEnabled) {
      await finish(this.emptySkeleton('flag_off', null, null, 0, false));
      return;
    }
    if (!repo.clonePath) {
      await finish(this.emptySkeleton('not_cloned', null, null, 0, false));
      return;
    }

    let state: IndexStateLike | null = null;
    let degradedReason: string | undefined;
    try {
      const s = await this.container.repoIntel.getIndexState(repoId);
      state = s;
      degradedReason = s.degradedReason;
    } catch {
      state = null;
    }
    const sha = state?.lastIndexedSha ?? '';
    const filesIndexed = state?.filesIndexed ?? 0;
    const indexPartial = state?.status === 'partial';
    if (!state || sha === '' || degradedReason === 'no_data') {
      await finish(this.emptySkeleton('index_missing', null, null, filesIndexed, indexPartial));
      return;
    }
    if (state.status === 'degraded' || state.status === 'failed') {
      await finish(this.emptySkeleton('index_degraded', sha, null, filesIndexed, indexPartial));
      return;
    }

    // --- Deterministic facts ---------------------------------------------------
    const ref: RepoRef = { owner: repo.owner, name: repo.name };
    const facts = await this.collectFacts(repoId, ref, sha);
    const known = { dirs: new Set(facts.structure.map((d) => d.dir)) };

    const components = await this.buildFactComponents(repoId, facts);
    const budget = budgetFactsPayload(components, MAX_FACTS_CHARS, FACT_DROP_ORDER);

    const skeletonInput = {
      structure: facts.structure,
      stack: buildStack(facts.manifestFacts),
      criticalPaths: facts.criticalPaths,
      packageManager: facts.manifests.packageManager,
      commands: facts.commands,
      reading: facts.reading,
      ranking: facts.ranking,
      indexPartial,
      filesIndexed,
      droppedComponents: budget.dropped,
    };
    const base = {
      indexSha: sha,
      factsChars: budget.chars,
      manifestSkips: facts.manifests.skipped,
    };

    if (facts.reading.length === 0) {
      await finish({
        ...base,
        status: 'skeleton',
        reason: 'index_degraded',
        content: buildSkeletonContent({ ...skeletonInput, errorClass: null }),
        provider: null,
        model: null,
        llmCalls: 0,
        tokensIn: null,
        tokensOut: null,
        costUsd: null,
      });
      return;
    }

    // --- Model resolution (D-5) --------------------------------------------------
    const override = await this.repo.getModelOverride(workspaceId);
    const def = FEATURE_MODELS.find((f) => f.id === 'onboarding');
    const provider = override?.provider ?? def?.defaultProvider ?? 'openrouter';
    const model = override?.model ?? def?.defaultModel ?? '';

    // --- The single, deadline-bounded LLM call --------------------------------------
    try {
      const llm = await this.container.llm(provider);
      const messages = await buildOnboardingMessages(budget.blocks, {
        criticalPaths: facts.criticalPaths,
        commands: facts.commands,
        readingPaths: facts.reading.map((r) => r.path),
      });
      const result = await withTimeout(
        llm.completeStructured({
          model,
          schema: OnboardingLlmOutput,
          schemaName: ONBOARDING_SCHEMA_NAME,
          messages,
          maxRetries: LLM_MAX_RETRIES,
          timeoutMs: LLM_ATTEMPT_TIMEOUT_MS,
          maxTokens: MAX_OUTPUT_TOKENS,
        }),
        ONBOARDING_LLM_DEADLINE_MS,
      );

      const skeleton = buildSkeletonContent({ ...skeletonInput, errorClass: null });
      const indexedPaths = await this.indexedCitedPaths(repoId, result.data, [
        ...facts.criticalPaths,
        ...facts.reading.map((r) => r.path),
      ]);
      const content = mergeAnnotations(skeleton, result.data, { indexedPaths, dirs: known.dirs });
      await finish({
        ...base,
        status: 'ready',
        reason: null,
        content,
        provider,
        model,
        llmCalls: result.attempts,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
      });
    } catch (err) {
      const { reason, errorClass } = classifyLlmError(err);
      await finish({
        ...base,
        status: 'skeleton',
        reason,
        content: buildSkeletonContent({ ...skeletonInput, errorClass }),
        provider,
        model,
        llmCalls: null,
        tokensIn: null,
        tokensOut: null,
        costUsd: null,
      });
    }
  }

  private emitLog(workspaceId: string, repoId: string, outcome: GenerationOutcome, durationMs: number): void {
    const fields = buildGenerationLogFields({ workspaceId, repoId, outcome, durationMs });
    if (outcome.status === 'ready') this.log.info(fields, 'onboarding.generation');
    else this.log.warn(fields, 'onboarding.generation');
  }

  /** A skeleton with empty lists — the zero-call, zero-fact paths (AC-27 to AC-29). */
  private emptySkeleton(
    reason: OnboardingSkeletonReason,
    indexSha: string | null,
    errorClass: string | null,
    filesIndexed: number,
    indexPartial: boolean,
  ): GenerationOutcome {
    return {
      status: 'skeleton',
      reason,
      content: buildSkeletonContent({
        structure: [],
        stack: [],
        criticalPaths: [],
        packageManager: null,
        commands: [],
        reading: [],
        ranking: 'graph_only',
        indexPartial,
        filesIndexed,
        droppedComponents: [],
        errorClass,
      }),
      indexSha,
      provider: null,
      model: null,
      llmCalls: 0,
      tokensIn: null,
      tokensOut: null,
      costUsd: null,
      factsChars: 0,
      manifestSkips: [],
    };
  }

  // -------------------------------------------------------------------------
  // Fact collection — each read degrades to empty, never throws
  // -------------------------------------------------------------------------

  private async safely<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  }

  /** Blob at `sha`, or null when absent/unreadable. Never reads the working tree (S-16). */
  private async blob(ref: RepoRef, sha: string, path: string): Promise<string | null> {
    return this.safely(() => this.container.git.readFileAt(ref, sha, path), null);
  }

  private async collectFacts(repoId: string, ref: RepoRef, sha: string): Promise<CollectedFacts> {
    const intel = this.container.repoIntel;

    const dirRows = await this.safely(() => intel.getDirFileCounts(repoId), []);
    const structure = selectStructure(dirRows, MAX_STRUCTURE_DIRS);

    // Manifests: root + safe indexed top-level dirs (R-5), bounded.
    const manifestPaths = [
      'package.json',
      ...structure.filter((d) => isSafeDirName(d.dir)).map((d) => `${d.dir}/package.json`),
    ].slice(0, MAX_MANIFESTS);
    const manifestFacts: ManifestFact[] = [];
    const skipped: ManifestSkip[] = [];
    for (const path of manifestPaths) {
      let raw: string | null;
      try {
        raw = await this.container.git.readFileAt(ref, sha, path);
      } catch {
        skipped.push({ path, reason: 'unreadable' });
        continue;
      }
      const parsed = parseManifest(path, raw, MAX_MANIFEST_BYTES);
      if ('fact' in parsed) manifestFacts.push(parsed.fact);
      else if (parsed.skip.reason !== 'missing' || path === 'package.json') skipped.push(parsed.skip);
    }

    // Presence checks (R-10).
    const present: Record<string, boolean> = {};
    for (const [file] of LOCKFILES) present[file] = (await this.blob(ref, sha, file)) !== null;
    const hasEnvExample = (await this.blob(ref, sha, '.env.example')) !== null;
    let hasCompose = false;
    for (const f of COMPOSE_FILES) {
      if ((await this.blob(ref, sha, f)) !== null) {
        hasCompose = true;
        break;
      }
    }
    let readme: string | null = null;
    for (const f of README_CANDIDATES) {
      const text = await this.blob(ref, sha, f);
      if (text !== null) {
        readme = text.slice(0, MAX_README_CHARS);
        break;
      }
    }

    const rootManifest = manifestFacts.find((m) => m.path === 'package.json');
    const manifests: ManifestFacts = {
      manifests: manifestFacts,
      skipped,
      packageManager: detectPackageManager(present),
      hasEnvExample,
      hasCompose,
      hasReadme: readme !== null,
      rootScripts: rootManifest?.scripts ?? [],
    };

    // Critical paths (AC-15).
    const chains = await this.safely(() => intel.getCriticalPaths(repoId), []);
    const topForCritical = await this.safely(() => intel.getTopFilesByRank(repoId, MAX_CRITICAL_PATHS), []);
    const criticalPaths = buildCriticalPathList(chains, topForCritical, MAX_CRITICAL_PATHS);

    // Reading path (AC-11..AC-13): pagerank pool, deepened history for hotness.
    const pool = await this.safely(() => intel.getTopFilesByRank(repoId, READING_POOL_SIZE), []);
    const ranks = pool.length > 0 ? await this.safely(() => intel.getPageRanks(repoId, pool), []) : [];
    const churn: CommitChurn | null = await this.safely(
      () =>
        this.container.git.commitChurnSince(ref, sha, {
          sinceDays: HOTNESS_WINDOW_DAYS,
          maxCommits: HOTNESS_MAX_COMMITS,
          timeoutMs: HISTORY_TIMEOUT_MS,
        }),
      null,
    );
    let indexed = new Set<string>();
    if (churn) {
      const churned = Object.entries(churn.byPath)
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_CHURN_PATHS)
        .map(([p]) => p);
      const rows = churned.length > 0 ? await this.safely(() => intel.getFileRank(repoId, churned), []) : [];
      indexed = new Set(rows.map((r) => r.path));
    }
    const hotness = computeHotness(churn, indexed);
    const reading = rankReadingPath(ranks, hotness);

    return {
      structure,
      manifests,
      manifestFacts,
      readme,
      criticalPaths,
      reading,
      ranking: churn && churn.commits > 0 ? 'graph_and_history' : 'graph_only',
      commands: buildRunCommands(manifests),
    };
  }

  /** Labelled facts blocks for the LLM, with droppable components marked (AC-21/22). */
  private async buildFactComponents(
    repoId: string,
    facts: CollectedFacts,
  ): Promise<FactsComponent[]> {
    const intel = this.container.repoIntel;
    const components: FactsComponent[] = [];

    components.push({
      component: null,
      block: {
        label: 'structure',
        text: facts.structure.map((d) => `${d.dir}/ (${d.files} files)`).join('\n') || '(none)',
      },
    });

    const withDeps = (deps: boolean): string =>
      facts.manifestFacts
        .map((m) => {
          const lines = [`${m.path}${m.name ? ` (${m.name})` : ''}`, `scripts: ${m.scripts.join(', ') || '(none)'}`];
          if (deps) lines.push(`dependencies: ${m.dependencies.join(', ') || '(none)'}`);
          return lines.join('\n');
        })
        .join('\n\n') || '(no manifests)';
    components.push({
      component: 'dependencies',
      block: { label: 'manifests', text: withDeps(true) },
      fallback: { label: 'manifests', text: withDeps(false) },
    });

    if (facts.readme) components.push({ component: 'readme', block: { label: 'readme', text: facts.readme } });

    const endpointRows = await this.safely(() => intel.getEndpointFacts(repoId), []);
    const endpointLines: string[] = [];
    for (const row of endpointRows) {
      for (const e of row.endpoints) {
        if (endpointLines.length >= MAX_ENDPOINTS) break;
        endpointLines.push(`${e} — ${row.path}`);
      }
      if (endpointLines.length >= MAX_ENDPOINTS) break;
    }
    if (endpointLines.length > 0) {
      components.push({ component: 'endpoints', block: { label: 'endpoints', text: endpointLines.join('\n') } });
    }

    const map = await this.safely(() => intel.getRepoMap(repoId), null);
    if (map && !map.degraded && map.text.length > 0) {
      components.push({ component: 'repo_map', block: { label: 'repo_map', text: map.text } });
    }
    return components;
  }

  /** Cited first-task paths (+ the skeleton's own paths) that are actually indexed. */
  private async indexedCitedPaths(
    repoId: string,
    output: OnboardingLlmOutput,
    skeletonPaths: string[],
  ): Promise<Set<string>> {
    const cited = new Set<string>();
    for (const task of output.first_tasks) {
      for (const p of task.paths) {
        cited.add(p.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, ''));
        if (cited.size >= MAX_CITED_PATHS) break;
      }
    }
    const rows = cited.size > 0 ? await this.safely(() => this.container.repoIntel.getFileRank(repoId, [...cited]), []) : [];
    return new Set<string>([...skeletonPaths, ...rows.map((r) => r.path)]);
  }
}
