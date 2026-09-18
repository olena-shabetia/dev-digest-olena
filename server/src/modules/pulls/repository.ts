import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { PrFindingsRollup } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { toFindingsRollup } from './status.js';

export interface PrReviewAggregate {
  /** Latest review's 0-100 score; null until the PR has been reviewed. */
  score: number | null;
  /** Sum of every agent_runs.cost_usd for this PR; null when unknown (never $0). */
  costUsd: number | null;
  /** Latest review's findings rollup; null when the PR has no review yet
   *  (distinct from a reviewed-and-clean PR, which rolls up to all zeros). */
  findings: PrFindingsRollup | null;
}

/** Findings of each PR's latest review, keyed by PR id. No join needed —
 *  `latestReviewIdByPr` already narrows to one review per PR; this just
 *  IN-queries `findings` by those ids and groups + rolls up in JS. */
async function findingsRollupByPr(
  db: Db,
  latestReviewIdByPr: Map<string, string>,
): Promise<Map<string, PrFindingsRollup>> {
  const latestReviewIds = [...latestReviewIdByPr.values()];
  const findingRows =
    latestReviewIds.length === 0
      ? []
      : await db
          .select({
            reviewId: t.findings.reviewId,
            severity: t.findings.severity,
            category: t.findings.category,
            title: t.findings.title,
            file: t.findings.file,
            startLine: t.findings.startLine,
            endLine: t.findings.endLine,
            confidence: t.findings.confidence,
            rationale: t.findings.rationale,
          })
          .from(t.findings)
          .where(inArray(t.findings.reviewId, latestReviewIds));
  const rowsByReviewId = new Map<string, typeof findingRows>();
  for (const row of findingRows) {
    const bucket = rowsByReviewId.get(row.reviewId);
    if (bucket) bucket.push(row);
    else rowsByReviewId.set(row.reviewId, [row]);
  }

  const result = new Map<string, PrFindingsRollup>();
  for (const [prId, reviewId] of latestReviewIdByPr) {
    result.set(prId, toFindingsRollup(rowsByReviewId.get(reviewId) ?? []));
  }
  return result;
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

  // Latest review's score (+ id, for the findings rollup below) per PR. Rows
  // are newest-first → first seen per PR is the latest. Scoped by workspace —
  // `findings` has no workspace_id of its own, so this is the only place that
  // access is guarded.
  const reviewRows = await db
    .select({ prId: t.reviews.prId, id: t.reviews.id, score: t.reviews.score })
    .from(t.reviews)
    .where(
      and(
        eq(t.reviews.workspaceId, workspaceId),
        inArray(t.reviews.prId, prIds),
        eq(t.reviews.kind, 'review'),
      ),
    )
    .orderBy(desc(t.reviews.createdAt));
  const scoreByPr = new Map<string, number | null>();
  const latestReviewIdByPr = new Map<string, string>();
  for (const rv of reviewRows) {
    if (!scoreByPr.has(rv.prId)) {
      scoreByPr.set(rv.prId, rv.score);
      latestReviewIdByPr.set(rv.prId, rv.id);
    }
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

  // Findings of the LATEST review only (the popover says "in this run").
  const findingsByPr = await findingsRollupByPr(db, latestReviewIdByPr);

  for (const prId of prIds) {
    result.set(prId, {
      score: scoreByPr.get(prId) ?? null,
      costUsd: costByPr.get(prId) ?? null,
      // null iff the PR has no review yet; a reviewed PR with zero findings
      // still gets a rollup (all zeros) — "reviewed and clean" is a real,
      // distinct state from "never reviewed".
      findings: findingsByPr.get(prId) ?? null,
    });
  }
  return result;
}
