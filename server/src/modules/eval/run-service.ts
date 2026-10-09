import type {
  EvalAgentRunsResponse,
  EvalDashboardIndex,
  EvalRunCompare,
  EvalSetRun,
  EvalSetRunCaseResult,
  EvalSetRunStarted,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { withTimeout } from '../../platform/resilience.js';
import {
  EVAL_CASE_TIMEOUT_MS,
  EVAL_DASHBOARD_RECENT_LIMIT,
  EVAL_ERROR,
  EVAL_REAPED_ERROR,
  EVAL_RUN_HISTORY_LIMIT,
} from './constants.js';
import { executeEvalCase, resolveEvalAgentConfig, type EvalAgentConfig } from './executor.js';
import { buildCompare, metricDeltas, toRunSummary, toSetRun } from './helpers.js';
import { EvalRepository } from './repository.js';
import { scoreRun, type ScoringCaseInput } from './scoring.js';
import type { StoredEvalCase, StoredEvalSetRun } from './types.js';

const DELETED_AGENT_NAME = '(deleted agent)';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Set runs: execute an agent over its whole eval set on a frozen snapshot,
 * persist progress on the run row, and serve history / compare / dashboard.
 * Detached promise (not JobRunner — see plan D-7): never rejects.
 */
export class EvalRunService {
  private readonly repo: EvalRepository;

  constructor(private readonly container: Container) {
    this.repo = new EvalRepository(container.db);
  }

  async startRun(workspaceId: string, agentId: string): Promise<EvalSetRunStarted> {
    const config = await resolveEvalAgentConfig(this.container, workspaceId, agentId);
    if (!config) throw new NotFoundError('Agent not found');

    const running = await this.repo.findRunningRun(workspaceId, agentId);
    if (running) return { run: toRunSummary(running, config.agentName), reused: true };

    const cases = await this.repo.listCases(workspaceId, agentId);
    if (cases.length === 0) {
      throw new AppError(EVAL_ERROR.setEmpty, 'This agent has no eval cases to run', 409);
    }

    const run = await this.repo.insertRunningRun({
      workspaceId,
      agentId,
      agentVersion: config.agentVersion,
      provider: config.provider,
      model: config.model,
      strategy: config.strategy,
      systemPrompt: config.systemPrompt,
      skills: config.skills,
      cases: cases.map((c) => ({ case_id: c.id, updated_at: c.updatedAt.toISOString() })),
      casesTotal: cases.length,
    });
    if (!run) {
      const existing = await this.repo.findRunningRun(workspaceId, agentId);
      if (existing) return { run: toRunSummary(existing, config.agentName), reused: true };
      throw new AppError('eval_run_conflict', 'Could not start the eval run, try again', 409);
    }

    // Detached: no await on case execution.
    void this.execute(workspaceId, run.id, config, cases);
    return { run: toRunSummary(run, config.agentName), reused: false };
  }

  /** Never rejects. Uses only the content captured at run start (R-5). */
  private async execute(
    workspaceId: string,
    runId: string,
    config: EvalAgentConfig,
    cases: StoredEvalCase[],
  ): Promise<void> {
    const startedAt = Date.now();
    try {
      let llm;
      try {
        llm = await this.container.llm(config.provider);
      } catch (err) {
        await this.failRun(workspaceId, runId, `Provider unavailable: ${errorMessage(err)}`, startedAt);
        return;
      }

      const inputs: ScoringCaseInput[] = [];
      const results: EvalSetRunCaseResult[] = [];
      const partials: { cost: number | null }[] = [];

      for (const c of cases) {
        const expectation = c.expectation;
        const base = {
          case_id: c.id,
          case_name: c.name,
          expectation_type: expectation.type,
        };
        try {
          const exec = await withTimeout(executeEvalCase(llm, config, {
            diffText: c.inputDiff,
            prTitle: c.pr.title,
            prBody: c.pr.body,
            expectation: {
              type: expectation.type,
              file: expectation.file,
              start_line: expectation.start_line,
              end_line: expectation.end_line,
            },
          }), EVAL_CASE_TIMEOUT_MS);
          inputs.push({
            caseId: c.id,
            expectations: [
              {
                type: expectation.type,
                file: expectation.file,
                start_line: expectation.start_line,
                end_line: expectation.end_line,
              },
            ],
            surviving: exec.findings.map((f) => ({
              file: f.file,
              start_line: f.start_line,
              end_line: f.end_line,
            })),
            preGate: exec.preGate,
            postGate: exec.postGate,
            errored: false,
          });
          partials.push({ cost: exec.costUsd });
          results.push({
            ...base,
            status: exec.outcome.status,
            matched: exec.outcome.matched,
            expected: exec.outcome.expected,
            surviving: exec.postGate,
            pre_gate: exec.preGate,
            post_gate: exec.postGate,
            duration_ms: exec.durationMs,
            cost_usd: exec.costUsd,
            error: null,
          });
        } catch (err) {
          inputs.push({
            caseId: c.id,
            expectations: [
              {
                type: expectation.type,
                file: expectation.file,
                start_line: expectation.start_line,
                end_line: expectation.end_line,
              },
            ],
            surviving: [],
            preGate: 0,
            postGate: 0,
            errored: true,
          });
          partials.push({ cost: null });
          results.push({
            ...base,
            status: 'errored',
            matched: 0,
            expected: expectation.type === 'must_find' ? 1 : 0,
            surviving: 0,
            pre_gate: 0,
            post_gate: 0,
            duration_ms: null,
            cost_usd: null,
            error: errorMessage(err),
          });
        }
        await this.repo.recordProgress(workspaceId, runId, { results, casesDone: results.length });
      }

      const score = scoreRun(inputs);
      const allErrored = score.cases_errored === score.cases_total;
      const costUsd = partials.some((p) => p.cost === null)
        ? null
        : partials.reduce((sum, p) => sum + (p.cost ?? 0), 0);
      await this.repo.finishRun(workspaceId, runId, {
        status: allErrored ? 'failed' : 'completed',
        error: allErrored ? 'Every case errored during this run' : null,
        results,
        casesDone: results.length,
        casesPassed: score.cases_passed,
        casesErrored: score.cases_errored,
        recall: allErrored ? null : score.recall,
        precision: allErrored ? null : score.precision,
        citationAccuracy: allErrored ? null : score.citation_accuracy,
        durationMs: Date.now() - startedAt,
        costUsd,
      });
    } catch (err) {
      await this.failRun(workspaceId, runId, errorMessage(err), startedAt);
    }
  }

  private async failRun(workspaceId: string, runId: string, reason: string, startedAt: number): Promise<void> {
    try {
      const current = await this.repo.getRun(workspaceId, runId);
      await this.repo.finishRun(workspaceId, runId, {
        status: 'failed',
        error: reason,
        results: current?.results ?? [],
        casesDone: current?.casesDone ?? 0,
        casesPassed: null,
        casesErrored: null,
        recall: null,
        precision: null,
        citationAccuracy: null,
        durationMs: Date.now() - startedAt,
        costUsd: null,
      });
    } catch {
      // Last resort: the run stays 'running' until the next boot reaps it.
    }
  }

  private async agentName(workspaceId: string, agentId: string): Promise<string> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    return agent?.name ?? DELETED_AGENT_NAME;
  }

  async getRun(workspaceId: string, runId: string): Promise<EvalSetRun> {
    const run = await this.repo.getRun(workspaceId, runId);
    if (!run) throw new NotFoundError('Eval run not found');
    return toSetRun(run, await this.agentName(workspaceId, run.agentId));
  }

  async listAgentRuns(workspaceId: string, agentId: string): Promise<EvalAgentRunsResponse> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const [runs, cases] = await Promise.all([
      this.repo.listRuns(workspaceId, agentId, EVAL_RUN_HISTORY_LIMIT),
      this.repo.listCases(workspaceId, agentId),
    ]);
    const summary = (r: StoredEvalSetRun) => toRunSummary(r, agent.name);
    const completed = runs.filter((r) => r.status === 'completed');
    const latest = completed[0];
    const previous = completed[1];
    const active = runs.find((r) => r.status === 'running');
    return {
      agent: {
        id: agent.id,
        name: agent.name,
        provider: agent.provider,
        model: agent.model,
        version: agent.version,
      },
      cases_total: cases.length,
      active_run: active ? summary(active) : null,
      latest_completed: latest ? summary(latest) : null,
      previous_completed: previous ? summary(previous) : null,
      delta: latest && previous ? metricDeltas(latest, previous) : null,
      runs: runs.map(summary),
    };
  }

  async compare(workspaceId: string, runIdA: string, runIdB: string): Promise<EvalRunCompare> {
    const [a, b] = await Promise.all([
      this.repo.getRun(workspaceId, runIdA),
      this.repo.getRun(workspaceId, runIdB),
    ]);
    if (!a || !b) throw new NotFoundError('Eval run not found');
    if (a.agentId !== b.agentId) {
      throw new AppError(EVAL_ERROR.compareInvalid, 'Runs belong to different agents', 409, {
        reason: 'different_agents',
      });
    }
    if (a.status !== 'completed' || b.status !== 'completed') {
      throw new AppError(EVAL_ERROR.compareInvalid, 'Both runs must be completed', 409, {
        reason: 'not_completed',
      });
    }
    return buildCompare(a, b, await this.agentName(workspaceId, a.agentId));
  }

  async dashboard(workspaceId: string): Promise<EvalDashboardIndex> {
    const [agents, counts, latest, recent] = await Promise.all([
      this.container.agentsRepo.list(workspaceId),
      this.repo.countCasesByAgent(workspaceId),
      this.repo.latestCompletedByAgent(workspaceId),
      this.repo.listRecentRuns(workspaceId, EVAL_DASHBOARD_RECENT_LIMIT),
    ]);
    const names = new Map(agents.map((a) => [a.id, a.name]));
    return {
      agents: agents.map((a) => {
        const l = latest.get(a.id);
        return {
          agent: { id: a.id, name: a.name, provider: a.provider, model: a.model, version: a.version },
          cases_total: counts.get(a.id) ?? 0,
          latest_completed: l ? toRunSummary(l, a.name) : null,
        };
      }),
      recent_runs: recent.flatMap((r) => {
        const name = names.get(r.agentId);
        return name === undefined ? [] : [toRunSummary(r, name)];
      }),
    };
  }

  /**
   * Global (not workspace-scoped), see plan D-14. At boot (no options) every
   * running row is orphaned. The scheduled sweep passes `olderThanMs`, because
   * inside the live process a young running row is a healthy run.
   */
  async reapStaleRuns(
    opts: { olderThanMs?: number; perCaseMs?: number; error?: string } = {},
  ): Promise<number> {
    return this.repo.reapRunningRuns(opts.error ?? EVAL_REAPED_ERROR, opts.olderThanMs, opts.perCaseMs);
  }
}
