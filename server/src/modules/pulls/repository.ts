import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export interface PrReviewAggregate {
  /** Latest review's 0-100 score; null until the PR has been reviewed. */
  score: number | null;
  /** Sum of every agent_runs.cost_usd for this PR; null when unknown (never $0). */
  costUsd: number | null;
}

/**
 * Per-PR review aggregates for the Pull Requests list: the latest review's
 * score (the score ring) and the total dollar cost of every run against the
 * PR (the COST column). Computed on read from `reviews` / `agent_runs` — no FK
 * denorm onto `pull_requests` — the list is small, so an IN-query per aggregate
 * plus JS grouping is cheap. Always workspace-scoped.
 */
export async function reviewAggregatesByPr(
  db: Db,
  workspaceId: string,
  prIds: string[],
): Promise<Map<string, PrReviewAggregate>> {
  const result = new Map<string, PrReviewAggregate>();
  if (prIds.length === 0) return result;

  // Latest review's score per PR. Rows are newest-first → first seen per PR
  // is the latest.
  const reviewRows = await db
    .select({ prId: t.reviews.prId, score: t.reviews.score })
    .from(t.reviews)
    .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
    .orderBy(desc(t.reviews.createdAt));
  const scoreByPr = new Map<string, number | null>();
  for (const rv of reviewRows) {
    if (!scoreByPr.has(rv.prId)) scoreByPr.set(rv.prId, rv.score);
  }

  // Sum of every run's cost for the PR — "what this PR cost me so far".
  // Postgres SUM() over an all-NULL group returns NULL, which is exactly the
  // "unknown" semantics cost_usd needs — never render that as $0.
  const costRows = await db
    .select({
      prId: t.agentRuns.prId,
      costUsd: sql<string | null>`sum(${t.agentRuns.costUsd})`,
    })
    .from(t.agentRuns)
    .where(and(eq(t.agentRuns.workspaceId, workspaceId), inArray(t.agentRuns.prId, prIds)))
    .groupBy(t.agentRuns.prId);
  const costByPr = new Map<string, number | null>();
  for (const row of costRows) {
    if (row.prId) costByPr.set(row.prId, row.costUsd == null ? null : Number(row.costUsd));
  }

  for (const prId of prIds) {
    result.set(prId, {
      score: scoreByPr.get(prId) ?? null,
      costUsd: costByPr.get(prId) ?? null,
    });
  }
  return result;
}
