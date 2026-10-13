import type { Container } from '../../platform/container.js';
import type {
  AgentRunEstimate,
  MultiAgentChild,
  MultiAgentRunDetail,
  MultiAgentRunListItem,
  RunSummary,
  Severity,
} from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { reviewToDto } from './helpers.js';
import {
  computeTotals,
  deriveMultiRunStatus,
  groupFindings,
  type BatchChild,
  type GroupableFinding,
} from './multi-run-grouping.js';
import { MultiRunReadRepository, type MultiRunChild } from './repository/multi-run-read.repo.js';

/** The run list is "minimal" (SPEC-14 S2); caps the second (children) query. */
const MULTI_RUN_LIST_LIMIT = 50;

/** Map one `MultiRunChild` row onto the public `RunSummary` shape. */
function toRunSummary(child: MultiRunChild): RunSummary {
  return {
    run_id: child.run_id,
    agent_id: child.agent_id,
    agent_name: child.agent_name,
    pr_number: child.pr_number,
    provider: child.provider,
    model: child.model,
    status: child.status,
    error: child.error,
    duration_ms: child.duration_ms,
    tokens_in: child.tokens_in,
    tokens_out: child.tokens_out,
    cost_usd: child.cost_usd,
    findings_count: child.findings_count,
    grounding: child.grounding,
    ran_at: child.ran_at,
    score: child.score,
    blockers: child.blockers,
  };
}

/**
 * Read model for multi-agent batches (L07, SPEC-14 criteria 28-39, 61-62,
 * 65-66, 69-71). Groups/verdicts/status/totals are computed on every read
 * from `multi-run-grouping.ts` — nothing is persisted. No container getter
 * (server/INSIGHTS.md 2026-09-22, `no-circular`): constructed inline in
 * `reviews/routes.ts`, same as `ReviewService`.
 */
export class MultiRunService {
  private repo: MultiRunReadRepository;

  constructor(container: Container) {
    this.repo = new MultiRunReadRepository(container.db);
  }

  /** `GET /multi-agent-runs/:id` (criteria 28-39, 65-66, 69-71). */
  async getDetail(workspaceId: string, multiAgentRunId: string): Promise<MultiAgentRunDetail> {
    const parent = await this.repo.getParent(workspaceId, multiAgentRunId);
    if (!parent) throw new NotFoundError('Multi-agent run not found');

    const children = await this.repo.listChildren(workspaceId, [parent.id]);
    if (children.length === 0) throw new NotFoundError('Multi-agent run not found');

    const runIds = children.map((c) => c.run_id);
    const reviewRows = await this.repo.reviewsForRuns(workspaceId, runIds);
    const reviewByRunId = new Map<string, (typeof reviewRows)[number]>();
    for (const row of reviewRows) {
      if (row.review.runId) reviewByRunId.set(row.review.runId, row);
    }

    const batchChildren: BatchChild[] = children.map((c) => {
      const match = reviewByRunId.get(c.run_id);
      return {
        run_id: c.run_id,
        agent_id: c.agent_id,
        agent_name: c.agent_name,
        status: c.status,
        review_id: match ? match.review.id : null,
      };
    });

    const findingsFlat: GroupableFinding[] = [];
    for (const { review, findings } of reviewRows) {
      for (const f of findings) {
        findingsFlat.push({
          id: f.id,
          review_id: review.id,
          file: f.file,
          start_line: f.startLine,
          end_line: f.endLine,
          severity: f.severity as Severity,
          confidence: f.confidence,
          title: f.title,
        });
      }
    }

    const multiAgentChildren: MultiAgentChild[] = children.map((c) => {
      const match = reviewByRunId.get(c.run_id);
      return {
        run: toRunSummary(c),
        review: match ? reviewToDto(match.review, match.findings, c.agent_name) : null,
      };
    });

    const groups = groupFindings(batchChildren, findingsFlat);
    const status = deriveMultiRunStatus(children.map((c) => c.status));
    const totals = computeTotals({
      ranAt: parent.ranAt,
      completedAt: parent.completedAt,
      children: children.map((c) => ({
        status: c.status,
        cost_usd: c.cost_usd,
        ran_at: c.ran_at,
        duration_ms: c.duration_ms,
      })),
    });

    return {
      id: parent.id,
      pr_id: parent.prId,
      repo_id: parent.repoId,
      pr_number: parent.prNumber,
      pr_title: parent.prTitle,
      ran_at: parent.ranAt.toISOString(),
      status,
      agent_count: children.length,
      totals,
      children: multiAgentChildren,
      groups,
    };
  }

  /** `GET /repos/:id/multi-agent-runs` — `[]` for an unknown repo. */
  async listForRepo(workspaceId: string, repoId: string): Promise<MultiAgentRunListItem[]> {
    const parents = await this.repo.listParentsForRepo(workspaceId, repoId, MULTI_RUN_LIST_LIMIT);
    if (parents.length === 0) return [];

    const parentIds = parents.map((p) => p.id);
    const allChildren = await this.repo.listChildren(workspaceId, parentIds);
    const childrenByParent = new Map<string, MultiRunChild[]>();
    for (const child of allChildren) {
      const list = childrenByParent.get(child.multi_agent_run_id);
      if (list) list.push(child);
      else childrenByParent.set(child.multi_agent_run_id, [child]);
    }

    return parents.map((parent) => {
      const children = childrenByParent.get(parent.id) ?? [];
      const status = deriveMultiRunStatus(children.map((c) => c.status));
      const totals = computeTotals({
        ranAt: parent.ranAt,
        completedAt: parent.completedAt,
        children: children.map((c) => ({
          status: c.status,
          cost_usd: c.cost_usd,
          ran_at: c.ran_at,
          duration_ms: c.duration_ms,
        })),
      });
      return {
        id: parent.id,
        pr_id: parent.prId,
        pr_number: parent.prNumber,
        pr_title: parent.prTitle,
        ran_at: parent.ranAt.toISOString(),
        status,
        agent_count: children.length,
        totals,
      };
    });
  }

  /** `GET /agent-run-estimates` (criteria 61-62) — a pass-through mapping. */
  async estimates(workspaceId: string): Promise<AgentRunEstimate[]> {
    const rows = await this.repo.agentEstimates(workspaceId);
    return rows.map((row) => ({
      agent_id: row.agentId,
      sample_size: row.sampleSize,
      avg_duration_ms: row.avgDurationMs,
      avg_cost_usd: row.avgCostUsd,
    }));
  }
}
