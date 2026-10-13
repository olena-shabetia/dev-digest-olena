import { and, desc, eq, exists, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { RunSummary } from '@devdigest/shared';
import type { FindingRow } from '../../../db/rows.js';
import type { ReviewRow } from './review.repo.js';

/** A `multi_agent_runs` parent row, joined with its PR for display fields. */
export interface MultiRunParent {
  id: string;
  prId: string;
  repoId: string;
  prNumber: number;
  prTitle: string;
  ranAt: Date;
  completedAt: Date | null;
}

/** A `RunSummary` plus the batch linkage fields grouping needs. */
export interface MultiRunChild extends RunSummary {
  multi_agent_run_id: string;
  position: number | null;
}

/**
 * All SQL for the multi-agent read model (L07, SPEC-14). Every query is
 * scoped by `workspace_id` — this is the `repository/<x>.repo.ts` tier
 * (`no-sql-outside-repository` allowlist), consumed only by
 * `multi-run.service.ts`.
 */
export class MultiRunReadRepository {
  constructor(private db: Db) {}

  /** The batch's parent row + its PR, or undefined if unknown in this workspace. */
  async getParent(workspaceId: string, multiAgentRunId: string): Promise<MultiRunParent | undefined> {
    const [row] = await this.db
      .select({
        id: t.multiAgentRuns.id,
        prId: t.multiAgentRuns.prId,
        ranAt: t.multiAgentRuns.ranAt,
        completedAt: t.multiAgentRuns.completedAt,
        repoId: t.pullRequests.repoId,
        prNumber: t.pullRequests.number,
        prTitle: t.pullRequests.title,
      })
      .from(t.multiAgentRuns)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
      .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.id, multiAgentRunId)));
    if (!row) return undefined;
    return {
      id: row.id,
      prId: row.prId,
      repoId: row.repoId,
      prNumber: row.prNumber,
      prTitle: row.prTitle,
      ranAt: row.ranAt,
      completedAt: row.completedAt,
    };
  }

  /**
   * Every child (`agent_runs`) of the given batches, scoped by workspace_id,
   * ordered by submission position within each batch (nulls last), then
   * `ran_at`, then `id`. Same `RunSummary` mapping as
   * `run.repo.ts:52-70`, plus the batch linkage.
   */
  async listChildren(workspaceId: string, parentIds: readonly string[]): Promise<MultiRunChild[]> {
    if (parentIds.length === 0) return [];
    const rows = await this.db
      .select({ run: t.agentRuns, agentName: t.agents.name, prNumber: t.pullRequests.number })
      .from(t.agentRuns)
      .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
      .leftJoin(t.pullRequests, eq(t.pullRequests.id, t.agentRuns.prId))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          inArray(t.agentRuns.multiAgentRunId, [...parentIds] as string[]),
        ),
      )
      .orderBy(
        sql`${t.agentRuns.multiAgentPosition} asc nulls last`,
        t.agentRuns.ranAt,
        t.agentRuns.id,
      );
    return rows.map(({ run, agentName, prNumber }) => ({
      run_id: run.id,
      agent_id: run.agentId,
      agent_name: agentName ?? null,
      pr_number: prNumber ?? null,
      provider: run.provider,
      model: run.model,
      status: run.status,
      error: run.error,
      duration_ms: run.durationMs,
      tokens_in: run.tokensIn,
      tokens_out: run.tokensOut,
      cost_usd: run.costUsd,
      findings_count: run.findingsCount,
      grounding: run.grounding,
      ran_at: run.ranAt ? run.ranAt.toISOString() : null,
      score: run.score,
      blockers: run.blockers,
      multi_agent_run_id: run.multiAgentRunId!,
      position: run.multiAgentPosition,
    }));
  }

  /** Reviews (+ their findings) for a set of runs, scoped by workspace_id. */
  async reviewsForRuns(
    workspaceId: string,
    runIds: readonly string[],
  ): Promise<{ review: ReviewRow; findings: FindingRow[] }[]> {
    if (runIds.length === 0) return [];
    const reviews = await this.db
      .select()
      .from(t.reviews)
      .where(
        and(eq(t.reviews.workspaceId, workspaceId), inArray(t.reviews.runId, [...runIds] as string[])),
      );
    if (reviews.length === 0) return [];
    const reviewIds = reviews.map((r) => r.id);
    const findings = await this.db
      .select()
      .from(t.findings)
      .where(inArray(t.findings.reviewId, reviewIds));
    return reviews.map((review) => ({
      review,
      findings: findings.filter((f) => f.reviewId === review.id),
    }));
  }

  /**
   * The newest `limit` batches for a repo that have at least one child,
   * scoped by workspace_id, newest first.
   */
  async listParentsForRepo(
    workspaceId: string,
    repoId: string,
    limit: number,
  ): Promise<MultiRunParent[]> {
    const rows = await this.db
      .select({
        id: t.multiAgentRuns.id,
        prId: t.multiAgentRuns.prId,
        ranAt: t.multiAgentRuns.ranAt,
        completedAt: t.multiAgentRuns.completedAt,
        repoId: t.pullRequests.repoId,
        prNumber: t.pullRequests.number,
        prTitle: t.pullRequests.title,
      })
      .from(t.multiAgentRuns)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
      .where(
        and(
          eq(t.multiAgentRuns.workspaceId, workspaceId),
          eq(t.pullRequests.repoId, repoId),
          exists(
            this.db
              .select({ one: sql`1` })
              .from(t.agentRuns)
              .where(eq(t.agentRuns.multiAgentRunId, t.multiAgentRuns.id)),
          ),
        ),
      )
      .orderBy(desc(t.multiAgentRuns.ranAt))
      .limit(limit);
    return rows.map((row) => ({
      id: row.id,
      prId: row.prId,
      repoId: row.repoId,
      prNumber: row.prNumber,
      prTitle: row.prTitle,
      ranAt: row.ranAt,
      completedAt: row.completedAt,
    }));
  }

  /**
   * Per-agent run-estimate aggregates over `status='done'` runs, all-time,
   * scoped by workspace_id. Postgres `avg()` ignores NULL inputs, so a field
   * with no non-null value on any done run comes back `null`.
   */
  async agentEstimates(
    workspaceId: string,
  ): Promise<{ agentId: string; sampleSize: number; avgDurationMs: number | null; avgCostUsd: number | null }[]> {
    const rows = await this.db
      .select({
        agentId: t.agents.id,
        sampleSize: sql<number>`count(${t.agentRuns.id}) filter (where ${t.agentRuns.status} = 'done')`,
        avgDurationMs: sql<string | null>`avg(${t.agentRuns.durationMs}) filter (where ${t.agentRuns.status} = 'done')`,
        avgCostUsd: sql<string | null>`avg(${t.agentRuns.costUsd}) filter (where ${t.agentRuns.status} = 'done')`,
      })
      .from(t.agents)
      .leftJoin(
        t.agentRuns,
        and(eq(t.agentRuns.agentId, t.agents.id), eq(t.agentRuns.workspaceId, workspaceId)),
      )
      .where(eq(t.agents.workspaceId, workspaceId))
      .groupBy(t.agents.id);
    return rows.map((row) => ({
      agentId: row.agentId,
      sampleSize: Number(row.sampleSize),
      avgDurationMs: row.avgDurationMs != null ? Number(row.avgDurationMs) : null,
      avgCostUsd: row.avgCostUsd != null ? Number(row.avgCostUsd) : null,
    }));
  }
}
