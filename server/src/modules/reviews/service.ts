import type { Container } from '../../platform/container.js';
import type {
  FindingActionKind,
  FindingRecord,
  ReviewRecord,
  ReviewRunTarget,
  RunEventKind,
  RunRequest,
  RunTrace,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { AgentRow } from '../../db/rows.js';
import { ReviewRepository } from './repository.js';
import { ReviewRunExecutor, type Logger } from './run-executor.js';
import { actOnFinding as actOnFindingImpl } from './findings.js';
import { reviewToDto } from './helpers.js';

// Re-export converters for backward-compatible imports from './service.js'
// (these previously lived here; logic now in ./helpers.ts).
export { findingRowToDto, reviewToDto } from './helpers.js';

/**
 * Review service (the core). Orchestrates:
 *   diff → assemblePrompt(system + repo-map + diff)
 *        → llm.completeStructured({ schema: Review }) (single-pass)
 *        → groundFindings(...) (citation gate — drops findings off the diff)
 *        → persist reviews + kept findings (+ grounding summary)
 *   while streaming RunEvents over container.runBus, and on completion writing
 *   the whole log as ONE RunTrace doc + an agent_runs row.
 *
 * Also: the finding accept/dismiss actions. The bulky run execution lives in
 * run-executor; this class keeps the public method surface.
 */
export class ReviewService {
  private repo: ReviewRepository;
  private agents: Container['agentsRepo'];
  private executor: ReviewRunExecutor;

  constructor(private container: Container) {
    this.repo = new ReviewRepository(container.db);
    this.agents = container.agentsRepo;
    this.executor = new ReviewRunExecutor(container, this.repo, this.agents);
  }

  // ===========================================================================
  // Run a review for one or all enabled agents on a PR.
  // ===========================================================================

  /**
   * Resolve which agents to run. Exactly one selector must be supplied:
   * `agentId` (single agent), `all: true` (every enabled agent), or
   * `agentIds` (L07 — an explicit set → one `multi_agent_runs` batch). The
   * 400 `invalid_run_request` lives here, not in the `RunRequest` schema,
   * because `{}` must still reach this method (reviews/routes.ts comment).
   */
  async resolveTargets(
    workspaceId: string,
    opts: { agentId?: string; all?: boolean; agentIds?: string[] },
  ): Promise<AgentRow[]> {
    const selectorCount =
      (opts.agentId !== undefined ? 1 : 0) +
      (opts.all === true ? 1 : 0) +
      (opts.agentIds !== undefined ? 1 : 0);
    if (selectorCount !== 1) {
      throw new AppError(
        'invalid_run_request',
        'Provide exactly one of agentId, all:true or agentIds',
        400,
      );
    }

    if (opts.agentIds !== undefined) {
      // Dedupe while preserving first occurrence (submission order).
      const uniqueIds = [...new Set(opts.agentIds)];
      const all = await this.agents.list(workspaceId);
      const byId = new Map(all.map((a) => [a.id, a]));
      const resolved: AgentRow[] = [];
      for (const id of uniqueIds) {
        const agent = byId.get(id);
        // Fail before any insert happens (no partial batch).
        if (!agent) throw new NotFoundError('Agent not found');
        resolved.push(agent);
      }
      return resolved;
    }

    if (opts.all) return this.agents.listEnabled(workspaceId);

    const agent = await this.agents.getById(workspaceId, opts.agentId!);
    if (!agent) throw new NotFoundError('Agent not found');
    return [agent];
  }

  /** Delete a whole review run (one agent's pass) + its findings (cascade). */
  async deleteReview(workspaceId: string, reviewId: string): Promise<boolean> {
    return this.repo.deleteReview(workspaceId, reviewId);
  }

  /** In-flight runs for a PR (server-side source of truth, survives reload). */
  async activeRuns(workspaceId: string, prId: string) {
    return this.repo.activeRunsForPull(workspaceId, prId);
  }

  /** All runs for a PR (any status), newest first — the run history (incl. failures). */
  async listRuns(workspaceId: string, prId: string) {
    return this.repo.listRunsForPull(workspaceId, prId);
  }

  /** Delete one run from the history (+ its trace). */
  async deleteRun(workspaceId: string, runId: string): Promise<boolean> {
    return this.repo.deleteAgentRun(workspaceId, runId);
  }

  /**
   * Cancel an in-flight run. Signals a live runner to stop at its next
   * checkpoint AND marks the DB row cancelled + completes the bus immediately —
   * so cancel also works for ORPHANED runs (whose background process died on a
   * server restart) where signalling alone would do nothing.
   */
  async cancelRun(runId: string): Promise<void> {
    this.publish(runId, 'info', 'Cancellation requested — stopping…');
    this.container.runBus.cancel(runId);
    await this.repo.cancelRunIfRunning(runId);
    this.container.runBus.complete(runId);
  }

  /** Reap runs left 'running'. On boot, with no options, that is every running
   *  row (the previous process is dead). The scheduled sweep passes an age. */
  async reapStaleRuns(opts?: { olderThanMs?: number; reason?: string }): Promise<number> {
    return this.repo.reapStaleRunningRuns(opts);
  }

  /**
   * Run a review for each target agent. Each agent gets its own runId
   * (= agent_runs.id) created up-front so the SSE route can be subscribed
   * before/while the run progresses. A partial failure in one agent does not
   * abort the others.
   *
   * `opts.multiAgent` (L07): when true, the agent_run rows are created as
   * children of ONE `multi_agent_runs` parent, in a single transaction, and
   * the executor is told the parent id so it can stamp `completed_at` after
   * settle-all. The response then carries a non-null `multi_agent_run_id`.
   */
  async runReview(
    workspaceId: string,
    prId: string,
    targets: AgentRow[],
    logger?: Logger,
    opts?: { multiAgent?: boolean },
  ): Promise<{
    runs: ReviewRunTarget[];
    reviews: ReviewRecord[];
    multi_agent_run_id: string | null;
  }> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    let multiAgentRunId: string | null = null;
    const runs: ReviewRunTarget[] = [];
    const jobs: { agent: AgentRow; runId: string }[] = [];

    if (opts?.multiAgent) {
      // One transaction: the parent + every child row, or none of them.
      const created = await this.repo.createMultiAgentRun({
        workspaceId,
        prId,
        children: targets.map((agent) => ({
          agentId: agent.id,
          provider: agent.provider,
          model: agent.model,
        })),
      });
      multiAgentRunId = created.multiAgentRunId;
      for (let i = 0; i < targets.length; i++) {
        const agent = targets[i]!;
        const runId = created.runIds[i]!;
        runs.push({ run_id: runId, agent_id: agent.id, agent_name: agent.name });
        jobs.push({ agent, runId });
      }
    } else {
      // Create the agent_run rows up front so a runId is available
      // IMMEDIATELY — the client persists these in global state and
      // subscribes to the SSE stream. The actual (slow) review runs in the
      // background below.
      for (const agent of targets) {
        const runId = await this.repo.createAgentRun({
          workspaceId,
          agentId: agent.id,
          prId,
          provider: agent.provider,
          model: agent.model,
        });
        runs.push({ run_id: runId, agent_id: agent.id, agent_name: agent.name });
        jobs.push({ agent, runId });
      }
    }

    // Fire-and-forget: the HTTP response returns now with the runIds; reviews
    // are persisted as each agent finishes and the client refetches on SSE done.
    void this.executor
      .executeRuns(
        workspaceId,
        pull,
        repo,
        jobs,
        logger,
        multiAgentRunId ? { multiAgentRunId } : undefined,
      )
      .catch((err) => {
        logger?.error({ prId, err: (err as Error).message }, 'review: background execution crashed');
      });

    return { runs, reviews: [], multi_agent_run_id: multiAgentRunId };
  }

  /**
   * HTTP-facing entry point for `POST /pulls/:id/review` (L07): resolves the
   * selector, then runs. `multiAgent` is derived from the selector shape
   * (`agentIds !== undefined`), not re-asked of the caller.
   */
  async startReview(
    workspaceId: string,
    prId: string,
    req: RunRequest,
    logger?: Logger,
  ): Promise<{
    runs: ReviewRunTarget[];
    reviews: ReviewRecord[];
    multi_agent_run_id: string | null;
  }> {
    const targets = await this.resolveTargets(workspaceId, {
      ...(req.agentId !== undefined ? { agentId: req.agentId } : {}),
      ...(req.all !== undefined ? { all: req.all } : {}),
      ...(req.agentIds !== undefined ? { agentIds: req.agentIds } : {}),
    });
    return this.runReview(workspaceId, prId, targets, logger, {
      multiAgent: req.agentIds !== undefined,
    });
  }

  private publish(runId: string, kind: RunEventKind, msg: string, data?: unknown) {
    return this.container.runBus.publish(runId, kind, msg, data);
  }

  // ===========================================================================
  // Finding actions
  // ===========================================================================

  async actOnFinding(
    workspaceId: string,
    findingId: string,
    action: FindingActionKind,
  ): Promise<{ finding: FindingRecord }> {
    return actOnFindingImpl(this.repo, workspaceId, findingId, action);
  }

  // ===========================================================================
  // Reads
  // ===========================================================================

  async reviewsForPull(workspaceId: string, prId: string): Promise<ReviewRecord[]> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const rows = await this.repo.reviewsForPull(prId);
    const names = new Map<string, string>();
    for (const { review } of rows) {
      if (review.agentId && !names.has(review.agentId)) {
        const a = await this.agents.getById(workspaceId, review.agentId);
        if (a) names.set(review.agentId, a.name);
      }
    }
    return rows.map(({ review, findings }) =>
      reviewToDto(review, findings, review.agentId ? names.get(review.agentId) : null),
    );
  }

  async getRunTrace(runId: string): Promise<RunTrace | undefined> {
    return this.repo.getRunTrace(runId);
  }
}
