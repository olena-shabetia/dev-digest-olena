/**
 * L05c — PR Brief orchestration. Business logic only, zero SQL. Gathers
 * best-effort facts (intent, blast radius, findings, attached spec docs), makes
 * ONE structured LLM call, grounds the answer against the PR's real files and
 * persists the record. Never persists anything on failure.
 */
import type {
  BlastRadius,
  BriefDataGap,
  Intent,
  PrBriefRecord,
  PrBriefResponse,
  Provider,
} from '@devdigest/shared';
import { FEATURE_MODELS, PrBriefRecord as PrBriefRecordSchema } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { readProjectDocsAtRef } from '../../platform/project-context/index.js';
import { ExternalServiceError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { classifyFile } from '../_shared/smart-diff-classifier.js';
import { BriefRepository } from './repository.js';
import {
  BRIEF_LLM_TIMEOUT_MS,
  BRIEF_MAX_RETRIES,
  BRIEF_MAX_TOKENS,
  BRIEF_SCHEMA_NAME,
} from './constants.js';
import { buildBriefFacts, groundBrief, isBriefStale, parseHunkRanges } from './helpers.js';
import { buildBriefMessages } from './prompt.js';
import { BriefExtraction } from './schemas.js';
import type { BriefLogger, HunkRange } from './types.js';

/** Structural mirror of repo-intel's `BlastResult` (no cross-module import). */
interface BlastInput {
  changedSymbols: { file: string; name: string; kind: string }[];
  callers: { file: string; symbol: string; viaSymbol: string; line: number }[];
  degraded?: boolean;
}

function toBlast(res: BlastInput): BlastRadius {
  const groups = new Map<string, { name: string; file: string; line: number }[]>();
  for (const c of res.callers) {
    const rows = groups.get(c.viaSymbol) ?? [];
    rows.push({ name: c.symbol, file: c.file, line: c.line });
    groups.set(c.viaSymbol, rows);
  }
  const downstream = [...groups.entries()].map(([symbol, callers]) => ({
    symbol,
    callers,
    endpoints_affected: [] as string[],
    crons_affected: [] as string[],
  }));
  const callerCount = downstream.reduce((n, d) => n + d.callers.length, 0);
  return {
    changed_symbols: res.changedSymbols.map(({ name, file, kind }) => ({ name, file, kind })),
    downstream,
    summary: `${res.changedSymbols.length} changed symbol(s), ${callerCount} caller(s)`,
  };
}

interface LlmStats {
  calls: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

function llmFields(l: LlmStats | null) {
  return {
    llm_calls: l?.calls ?? null,
    tokens_in: l?.tokensIn ?? null,
    tokens_out: l?.tokensOut ?? null,
    cost_usd: l?.costUsd ?? null,
  };
}

export class BriefService {
  private readonly inFlight = new Map<string, Promise<PrBriefResponse>>();
  private readonly repo: BriefRepository;

  constructor(
    private container: Container,
    private log: BriefLogger,
  ) {
    this.repo = new BriefRepository(container.db);
  }

  /** GET — pure DB read, never calls the LLM. */
  async getBrief(workspaceId: string, prId: string): Promise<PrBriefResponse> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const raw = await this.repo.getBrief(workspaceId, prId);
    const parsed = raw === undefined ? null : PrBriefRecordSchema.safeParse(raw);
    const brief = parsed && parsed.success ? parsed.data : null;
    return { brief, head_sha: pull.headSha, stale: isBriefStale(brief, pull.headSha) };
  }

  /** POST — concurrent calls for the same PR share one run. */
  generate(workspaceId: string, prId: string): Promise<PrBriefResponse> {
    const key = `${workspaceId}:${prId}`;
    const running = this.inFlight.get(key);
    if (running) return running;
    const p = this.run(workspaceId, prId).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, p);
    return p;
  }

  private async run(workspaceId: string, prId: string): Promise<PrBriefResponse> {
    const started = Date.now();
    const state: { base: Record<string, unknown>; llm: LlmStats | null } = {
      base: { workspace_id: workspaceId, pr_id: prId },
      llm: null,
    };
    try {
      const out = await this.runInner(workspaceId, prId, state);
      this.log.info(
        { ...state.base, status: 'ready', ...llmFields(state.llm), duration_ms: Date.now() - started },
        'brief.generation',
      );
      return out;
    } catch (err) {
      this.log.warn(
        { ...state.base, status: 'failed', ...llmFields(state.llm), duration_ms: Date.now() - started },
        'brief.generation',
      );
      throw err;
    }
  }

  private async runInner(
    workspaceId: string,
    prId: string,
    state: { base: Record<string, unknown>; llm: LlmStats | null },
  ): Promise<PrBriefResponse> {
    const c = this.container;
    const pull = await c.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const headSha = pull.headSha; // captured once; never re-read after the LLM call

    const files = await c.reviewRepo.getPrFiles(prId);
    if (files.length === 0) throw new ValidationError('Pull request has no changed files');
    const paths = files.map((f) => f.path);

    const gaps: BriefDataGap[] = [];

    // ---- intent ----
    let intent: Intent | null = null;
    try {
      const row = await c.intentRepo.getIntent(workspaceId, prId);
      if (row && !row.error) {
        intent = {
          intent: row.intent,
          in_scope: row.inScope,
          out_of_scope: row.outOfScope,
          sources: row.sources,
          confidence: row.confidence as Intent['confidence'],
          context_gaps: row.contextGaps,
        };
      }
    } catch {
      intent = null;
    }
    if (!intent) gaps.push('intent');

    // ---- blast ----
    let blast: BlastRadius | null = null;
    try {
      const res = await c.repoIntel.getBlastRadius(pull.repoId, paths);
      if (!res.degraded) blast = toBlast(res);
    } catch {
      blast = null;
    }
    if (!blast) gaps.push('blast');

    // ---- findings ----
    let findings: { file: string; line: number; severity: string }[] = [];
    try {
      const reviews = await c.reviewRepo.reviewsForPull(prId);
      findings = reviews.flatMap((r) =>
        r.findings.map((f) => ({ file: f.file, line: f.startLine, severity: f.severity })),
      );
    } catch {
      gaps.push('findings');
    }

    // ---- specs (attached project-context docs) ----
    const specs: { path: string; content: string }[] = [];
    try {
      const seen = new Set<string>();
      const specPaths: string[] = [];
      for (const agent of await c.agentsRepo.listEnabled(workspaceId)) {
        for (const p of await c.agentsRepo.listContextDocs(agent.id, pull.repoId)) {
          if (!seen.has(p)) {
            seen.add(p);
            specPaths.push(p);
          }
        }
      }
      if (specPaths.length > 0) {
        const repo = await c.reviewRepo.getRepo(pull.repoId);
        if (!repo) {
          gaps.push('specs');
        } else {
          const res = await readProjectDocsAtRef(
            c.git,
            { owner: repo.owner, name: repo.name },
            headSha,
            pull.number,
            specPaths,
          );
          for (const d of res.docs) specs.push({ path: d.path, content: d.content });
          if (res.status === 'head_unavailable' || res.skipped.length > 0) gaps.push('specs');
        }
      }
    } catch {
      gaps.push('specs');
    }

    // ---- facts + messages ----
    const hunksByPath = new Map<string, HunkRange[]>();
    const factFiles = files.map((f) => {
      const hunks = parseHunkRanges(f.patch);
      hunksByPath.set(f.path, hunks);
      return {
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        role: classifyFile(f.path),
        hunks,
      };
    });
    const facts = buildBriefFacts(
      {
        title: pull.title,
        description: pull.body ?? '',
        intent,
        blast,
        files: factFiles,
        totalFiles: files.length,
        findings,
        specs,
      },
      gaps,
    );
    const messages = buildBriefMessages(facts.blocks);

    // ---- model + one LLM call ----
    const override = await this.repo.getBriefModelOverride(workspaceId);
    const def = FEATURE_MODELS.find((f) => f.id === 'risk_brief');
    const provider = (override?.provider ?? def?.defaultProvider ?? 'openai') as Provider;
    const model = override?.model ?? def?.defaultModel ?? 'gpt-4.1';

    state.base = {
      workspace_id: workspaceId,
      pr_id: prId,
      head_sha: headSha,
      provider,
      model,
      facts_chars: facts.factsChars,
      dropped_components: facts.dropped,
    };

    let result;
    try {
      const llm = await c.llm(provider);
      result = await llm.completeStructured({
        model,
        schema: BriefExtraction,
        schemaName: BRIEF_SCHEMA_NAME,
        messages,
        maxRetries: BRIEF_MAX_RETRIES,
        maxTokens: BRIEF_MAX_TOKENS,
        timeoutMs: BRIEF_LLM_TIMEOUT_MS,
      });
    } catch {
      throw new ExternalServiceError('Brief generation failed');
    }
    state.llm = {
      calls: result.attempts,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
    };

    // ---- ground, assemble, persist ----
    const grounded = groundBrief(result.data, new Set(paths), hunksByPath);
    const record: PrBriefRecord = PrBriefRecordSchema.parse({
      summary: grounded.summary,
      intent,
      blast,
      risks: { risks: grounded.risks },
      review_focus: grounded.review_focus,
      history: { history: [] },
      meta: {
        head_sha: headSha,
        provider,
        model,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        cost_usd: result.costUsd,
        generated_at: new Date().toISOString(),
        data_gaps: facts.dataGaps,
      },
    });
    await this.repo.upsertBrief(workspaceId, prId, record);

    return { brief: record, head_sha: headSha, stale: false };
  }
}
