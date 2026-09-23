import type { Container } from '../../platform/container.js';
import type { PrIntentRecord, UnifiedDiff, Provider } from '@devdigest/shared';
import { IntentRepository } from './repository.js';
import {
  buildIntentSources,
  reconstructHunkHeader,
  resolveIntentIssues,
  type IntentIssueResolution,
  type IntentSpecResolution,
} from './sources.js';
import { buildIntentMessages } from './prompt.js';
import { IntentExtraction } from './schemas.js';
import { clampConfidence, toIntentDto } from './helpers.js';
import { DEFAULT_INTENT_MODEL, INTENT_SCHEMA_NAME, SPEC_PLAN_PATH_SRC } from './constants.js';
import { NotFoundError } from '../../platform/errors.js';

const SPEC_PLAN_PATH_RE = new RegExp(SPEC_PLAN_PATH_SRC, 'gi');

export interface EnsureIntentOpts {
  /** Bypass the head-sha cache check and re-derive unconditionally. */
  force?: boolean;
  /** The diff already loaded by the caller (run-executor) — reused ONLY for
   *  its numeric hunk headers, never re-fetched here, so intent derivation
   *  never doubles the diff-load I/O the review run already paid for. */
  diff?: UnifiedDiff;
}

/**
 * L03 — Intent derivation. Business logic only, zero SQL (server/AGENTS.md):
 * cache check → deterministic source assembly → one structured-output LLM
 * call → server-side confidence clamp → persist. Every enrichment call
 * (issue fetch, spec/plan read) and the LLM call itself degrade rather than
 * throw — an intent failure NEVER fails the review run
 * (server/AGENTS.md:38-40).
 */
export class IntentService {
  private repo: IntentRepository;

  constructor(private container: Container) {
    this.repo = new IntentRepository(container.db);
  }

  /** GET /pulls/:id/intent — pure DB read. `undefined` PR ⇒ 404 (route). */
  async getIntent(workspaceId: string, prId: string): Promise<PrIntentRecord | null> {
    const pull = await this.repo.getPullForIntent(workspaceId, prId);
    if (!pull) throw new NotFoundError('PR not found');
    const row = await this.repo.getIntent(workspaceId, prId);
    return row ? toIntentDto(row) : null;
  }

  /** POST /pulls/:id/intent — fetches the PR's current head_sha itself
   *  (routes.ts has no cheap way to know it), then delegates to
   *  `ensureIntent` exactly as the review-run pre-work does. */
  async deriveIntent(workspaceId: string, prId: string, force: boolean): Promise<PrIntentRecord> {
    const pull = await this.repo.getPullForIntent(workspaceId, prId);
    if (!pull) throw new NotFoundError('PR not found');
    const record = await this.ensureIntent(workspaceId, prId, pull.headSha, { force });
    // `ensureIntent` only returns `undefined` when the LLM call throws AND no
    // row could be persisted (e.g. PR vanished mid-call) — treat that as a
    // hard failure here since POST is a synchronous "derive it now" request.
    if (!record) {
      const fallback = await this.repo.getIntent(workspaceId, prId);
      if (fallback) return toIntentDto(fallback);
      throw new NotFoundError('PR not found');
    }
    return record;
  }

  /**
   * Shared pre-work entry point (`server/specs/L03-intent-layer.api.md`'s
   * 7-step algorithm), called from `ReviewRunExecutor#executeRuns` with the
   * PR's already-known `headSha` — cache-hit path costs exactly one query
   * and ZERO LLM calls, never fetching the full PR row at all.
   */
  async ensureIntent(
    workspaceId: string,
    prId: string,
    headSha: string,
    opts: EnsureIntentOpts = {},
  ): Promise<PrIntentRecord | undefined> {
    // ---- 1. Cache check ----------------------------------------------------
    if (!opts.force) {
      const existing = await this.repo.getIntent(workspaceId, prId);
      if (existing && existing.headSha === headSha && !existing.error) {
        return toIntentDto(existing);
      }
    }

    const pull = await this.repo.getPullForIntent(workspaceId, prId);
    if (!pull) return undefined;

    // ---- 2. Deterministic source assembly ----------------------------------
    const issueRefs = resolveIntentIssues(pull.body);
    const issues: IntentIssueResolution[] = [];
    for (const ref of issueRefs) {
      try {
        const github = await this.container.github();
        const issue = await github.getIssue(
          { owner: ref.owner ?? pull.repoOwner, name: ref.repo ?? pull.repoName },
          ref.number,
        );
        issues.push({ ref: ref.ref, keyworded: ref.keyworded, status: 'used', title: issue.title, body: issue.body ?? null });
      } catch {
        issues.push({ ref: ref.ref, keyworded: ref.keyworded, status: 'unavailable' });
      }
    }

    const specPaths = new Set<string>();
    for (const m of (pull.body ?? '').matchAll(SPEC_PLAN_PATH_RE)) {
      const path = m[1];
      if (path) specPaths.add(path);
    }
    const specs: IntentSpecResolution[] = [];
    for (const path of specPaths) {
      const kind: 'spec' | 'plan' = path.startsWith('plans/') ? 'plan' : 'spec';
      if (!pull.clonePath) {
        specs.push({ path, kind, status: 'unavailable' });
        continue;
      }
      try {
        const content = await this.container.git.readFile({ owner: pull.repoOwner, name: pull.repoName }, path);
        specs.push({ path, kind, status: 'used', content });
      } catch {
        specs.push({ path, kind, status: 'unavailable' });
      }
    }

    const [files, commits] = await Promise.all([
      this.repo.getPrFilePaths(pull.id),
      this.repo.getPrCommitMessages(pull.id),
    ]);

    const hunks = (opts.diff?.files ?? []).flatMap((f) =>
      f.hunks.map((h) => ({ file: f.path, header: reconstructHunkHeader(h) })),
    );

    const { sources, blocks } = buildIntentSources({
      title: pull.title,
      body: pull.body,
      issues,
      specs,
      files,
      hunks,
      commits,
    });

    // ---- 3. Resolve the derivation model ------------------------------------
    const override = await this.repo.getIntentModelOverride(workspaceId);
    const { provider, model } = override ?? DEFAULT_INTENT_MODEL;

    // ---- 4. One structured-output LLM call -----------------------------------
    // `provider: { require_parameters: true }` is NOT sent — `StructuredRequest`
    // (vendor/shared/adapters.ts) has no `provider` field and
    // `OpenRouterProvider#completeStructured` builds a fixed body with no
    // pass-through for it; adding one is out of this plan's scope (plan §9,
    // "Resolved (was open)"). Mitigated today by the existing
    // retry/repair loop in reviewer-core's structured-output helper.
    try {
      const llm = await this.container.llm(provider as Provider);
      const messages = buildIntentMessages(blocks);
      const result = await llm.completeStructured({
        model,
        schema: IntentExtraction,
        schemaName: INTENT_SCHEMA_NAME,
        messages,
      });
      const proposed = result.data;

      // ---- 5. Clamp + 6. Persist -------------------------------------------
      const confidence = clampConfidence(proposed.confidence, sources);
      const row = await this.repo.upsertIntent(workspaceId, prId, {
        intent: proposed.intent,
        inScope: proposed.in_scope,
        outOfScope: proposed.out_of_scope,
        sources,
        confidence,
        contextGaps: proposed.context_gaps,
        headSha,
        provider,
        model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
        error: null,
        generatedAt: new Date(),
      });
      return toIntentDto(row);
    } catch (err) {
      // ---- 7. On throw — never fail the review run ---------------------------
      const message = err instanceof Error ? err.message : String(err);
      try {
        await this.repo.upsertIntent(workspaceId, prId, {
          intent: '',
          inScope: [],
          outOfScope: [],
          sources,
          confidence: 'low',
          contextGaps: [],
          headSha,
          provider,
          model,
          tokensIn: null,
          tokensOut: null,
          costUsd: null,
          error: message,
          generatedAt: new Date(),
        });
      } catch {
        // Persisting the error row failed too — the run still must not fail.
      }
      return undefined;
    }
  }
}
