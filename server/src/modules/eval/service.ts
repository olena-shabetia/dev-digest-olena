import type {
  EvalCaseCreateRequest,
  EvalCaseDetail,
  EvalCaseDraft,
  EvalCaseDraftResponse,
  EvalCaseListResponse,
  EvalCasePrMeta,
  EvalCaseUpdateRequest,
  EvalDraftRunRequest,
  EvalDraftRunResult,
  EvalExpectation,
  EvalExpectationType,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { loadPullDiff, parseUnifiedDiff } from '../../platform/diff.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import { EvalRepository } from './repository.js';
import {
  EVAL_DRAFT_RUN_TIMEOUT_MS,
  EVAL_ERROR,
  EVAL_RUN_HISTORY_LIMIT,
} from './constants.js';
import {
  buildDraftDiff,
  deriveExpectationType,
  lastResultForCase,
  toCaseDetail,
  toCaseListItem,
  validateCaseDiff,
  validateCaseName,
  validateExpectation,
} from './helpers.js';
import { executeEvalCase, resolveEvalAgentConfig } from './executor.js';
import type { StoredEvalCase } from './types.js';

type FindingContext = NonNullable<Awaited<ReturnType<Container['reviewRepo']['findingContext']>>>;

interface LoadedFinding {
  ctx: FindingContext;
  type: EvalExpectationType;
  agentId: string;
  agentName: string;
}

interface Prepared {
  type: EvalExpectationType;
  expectation: EvalExpectation;
  inputDiff: string;
  pr: EvalCasePrMeta;
}

/**
 * Eval case use cases: draft from a finding, draft run, save/update/read/list/
 * delete. Zero SQL (goes through EvalRepository and container repos).
 */
export class EvalService {
  private readonly repo: EvalRepository;

  constructor(private readonly container: Container) {
    this.repo = new EvalRepository(container.db);
  }

  // ---- finding context ----------------------------------------------------

  private async loadFindingContext(workspaceId: string, findingId: string): Promise<LoadedFinding> {
    const ctx = await this.container.reviewRepo.findingContext(findingId);
    if (!ctx || ctx.pull.workspaceId !== workspaceId) throw new NotFoundError('Finding not found');
    const type = deriveExpectationType(ctx.finding);
    if (!type) {
      throw new AppError(EVAL_ERROR.findingUndecided, 'Accept or dismiss the finding first', 409);
    }
    const agentId = ctx.review.agentId;
    const agent = agentId ? await this.container.agentsRepo.getById(workspaceId, agentId) : undefined;
    if (!agentId || !agent) {
      throw new AppError(
        EVAL_ERROR.agentMissing,
        'The agent that produced this finding no longer exists',
        409,
      );
    }
    return { ctx, type, agentId, agentName: agent.name };
  }

  private prMeta(pull: FindingContext['pull']): EvalCasePrMeta {
    return { number: pull.number, title: pull.title, body: pull.body ?? null, head_sha: pull.headSha };
  }

  private async agentName(workspaceId: string, agentId: string): Promise<string> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    return agent?.name ?? '';
  }

  private async toDetail(workspaceId: string, c: StoredEvalCase): Promise<EvalCaseDetail> {
    const [name, runs] = await Promise.all([
      this.agentName(workspaceId, c.agentId),
      this.repo.listRuns(workspaceId, c.agentId, EVAL_RUN_HISTORY_LIMIT),
    ]);
    return toCaseDetail(c, name, lastResultForCase(runs, c.id));
  }

  // ---- draft --------------------------------------------------------------

  async draftForFinding(workspaceId: string, findingId: string): Promise<EvalCaseDraftResponse> {
    const { ctx, type, agentId, agentName } = await this.loadFindingContext(workspaceId, findingId);

    const existing = await this.repo.findCaseByFinding(workspaceId, agentId, findingId);
    if (existing) return { kind: 'existing', case: await this.toDetail(workspaceId, existing) };

    const repoRow = await this.container.reviewRepo.getRepo(ctx.pull.repoId);
    if (!repoRow) throw new NotFoundError('Repository not found');
    const diff = await loadPullDiff(
      this.container.git,
      ctx.pull,
      { owner: repoRow.owner, name: repoRow.name },
      (id) => this.container.reviewRepo.getPrFiles(id),
    );
    const f = ctx.finding;
    const built = buildDraftDiff(diff, {
      file: f.file,
      startLine: f.startLine,
      endLine: f.endLine,
      kind: f.kind,
    });
    if (!built) {
      throw new AppError(
        EVAL_ERROR.findingOutdated,
        'The finding no longer matches the pull request diff',
        409,
      );
    }
    const draft: EvalCaseDraft = {
      finding_id: f.id,
      agent_id: agentId,
      agent_name: agentName,
      name: f.title,
      input_diff: built.inputDiff,
      pr: this.prMeta(ctx.pull),
      expectation: {
        type,
        file: f.file,
        start_line: f.startLine,
        end_line: f.endLine,
        severity: f.severity,
        category: f.category,
        title: f.title,
      },
      needs_relocation: built.needsRelocation,
    };
    return { kind: 'draft', draft };
  }

  // ---- validation shared by draft run / create / update --------------------

  private prepare(
    body: { input_diff: string; expectation: { file: string; start_line: number; end_line: number } },
    base: { type: EvalExpectationType; severity: string; category: string; title: string; pr: EvalCasePrMeta },
  ): Prepared {
    const diff = parseUnifiedDiff(body.input_diff);
    const file = validateCaseDiff(diff);
    const loc = validateExpectation(body.expectation, file);
    return {
      type: base.type,
      inputDiff: body.input_diff,
      pr: base.pr,
      expectation: {
        type: base.type,
        file: loc.file,
        start_line: loc.start_line,
        end_line: loc.end_line,
        severity: base.severity,
        category: base.category,
        title: base.title,
      },
    };
  }

  // ---- draft run ----------------------------------------------------------

  async draftRun(workspaceId: string, body: EvalDraftRunRequest): Promise<EvalDraftRunResult> {
    let agentId: string;
    let prepared: Prepared;
    if (body.finding_id) {
      const loaded = await this.loadFindingContext(workspaceId, body.finding_id);
      agentId = loaded.agentId;
      const f = loaded.ctx.finding;
      prepared = this.prepare(body, {
        type: loaded.type,
        severity: f.severity,
        category: f.category,
        title: f.title,
        pr: this.prMeta(loaded.ctx.pull),
      });
    } else {
      const stored = await this.repo.getCase(workspaceId, body.case_id!);
      if (!stored) throw new NotFoundError('Eval case not found');
      agentId = stored.agentId;
      prepared = this.prepare(body, {
        type: stored.expectation.type,
        severity: stored.expectation.severity,
        category: stored.expectation.category,
        title: stored.expectation.title,
        pr: stored.pr,
      });
    }

    const config = await resolveEvalAgentConfig(this.container, workspaceId, agentId);
    if (!config) {
      throw new AppError(EVAL_ERROR.agentMissing, 'The agent for this case no longer exists', 409);
    }

    let exec;
    try {
      const llm = await this.container.llm(config.provider);
      exec = await withTimeout(
        executeEvalCase(llm, config, {
          diffText: prepared.inputDiff,
          prTitle: prepared.pr.title,
          prBody: prepared.pr.body,
          expectation: {
            type: prepared.type,
            file: prepared.expectation.file,
            start_line: prepared.expectation.start_line,
            end_line: prepared.expectation.end_line,
          },
        }),
        EVAL_DRAFT_RUN_TIMEOUT_MS,
      );
    } catch (err) {
      if (err instanceof TimeoutError) {
        throw new AppError(EVAL_ERROR.draftRunTimeout, 'The draft run timed out', 504);
      }
      const reason = err instanceof Error ? err.message : String(err);
      throw new AppError(EVAL_ERROR.draftRunFailed, 'The draft run failed', 502, { reason });
    }

    return {
      expectation_type: prepared.type,
      status: exec.outcome.status === 'passed' ? 'passed' : 'failed',
      matched: exec.outcome.matched,
      expected: exec.outcome.expected,
      findings: exec.findings,
      pre_gate: exec.preGate,
      post_gate: exec.postGate,
      duration_ms: exec.durationMs,
      cost_usd: exec.costUsd,
    };
  }

  // ---- create / update / read / list / delete ------------------------------

  async createCase(workspaceId: string, body: EvalCaseCreateRequest): Promise<EvalCaseDetail> {
    const name = validateCaseName(body.name);
    const loaded = await this.loadFindingContext(workspaceId, body.finding_id);
    const f = loaded.ctx.finding;
    const prepared = this.prepare(body, {
      type: loaded.type,
      severity: f.severity,
      category: f.category,
      title: f.title,
      pr: this.prMeta(loaded.ctx.pull),
    });
    // displayed_type is used for this comparison only; it is never stored.
    if (body.displayed_type && body.displayed_type !== loaded.type) {
      throw new AppError(
        EVAL_ERROR.typeChanged,
        'The decision on this finding changed while the form was open',
        409,
      );
    }
    const inserted = await this.repo.insertCase({
      workspaceId,
      agentId: loaded.agentId,
      sourceFindingId: f.id,
      name,
      inputDiff: prepared.inputDiff,
      pr: prepared.pr,
      expectation: prepared.expectation,
    });
    if (!inserted) {
      const existing = await this.repo.findCaseByFinding(workspaceId, loaded.agentId, f.id);
      throw new AppError(EVAL_ERROR.caseExists, 'An eval case already exists for this finding', 409, {
        case_id: existing?.id ?? null,
      });
    }
    return this.toDetail(workspaceId, inserted);
  }

  async updateCase(
    workspaceId: string,
    caseId: string,
    body: EvalCaseUpdateRequest,
  ): Promise<EvalCaseDetail> {
    const stored = await this.repo.getCase(workspaceId, caseId);
    if (!stored) throw new NotFoundError('Eval case not found');
    const name = validateCaseName(body.name);
    const prepared = this.prepare(body, {
      type: stored.expectation.type,
      severity: stored.expectation.severity,
      category: stored.expectation.category,
      title: stored.expectation.title,
      pr: stored.pr,
    });
    const updated = await this.repo.updateCase(workspaceId, caseId, {
      name,
      inputDiff: prepared.inputDiff,
      expectation: prepared.expectation,
    });
    if (!updated) throw new NotFoundError('Eval case not found');
    return this.toDetail(workspaceId, updated);
  }

  async getCase(workspaceId: string, caseId: string): Promise<EvalCaseDetail> {
    const stored = await this.repo.getCase(workspaceId, caseId);
    if (!stored) throw new NotFoundError('Eval case not found');
    return this.toDetail(workspaceId, stored);
  }

  async listCases(workspaceId: string, agentId: string): Promise<EvalCaseListResponse> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const [cases, runs] = await Promise.all([
      this.repo.listCases(workspaceId, agentId),
      this.repo.listRuns(workspaceId, agentId, EVAL_RUN_HISTORY_LIMIT),
    ]);
    const items = cases.map((c) => toCaseListItem(c, agent.name, lastResultForCase(runs, c.id)));
    return {
      agent_id: agentId,
      cases: items,
      cases_total: items.length,
      cases_passing: items.filter((i) => i.last_result?.status === 'passed').length,
    };
  }

  async deleteCase(workspaceId: string, caseId: string): Promise<void> {
    const ok = await this.repo.deleteCase(workspaceId, caseId);
    if (!ok) throw new NotFoundError('Eval case not found');
  }
}
