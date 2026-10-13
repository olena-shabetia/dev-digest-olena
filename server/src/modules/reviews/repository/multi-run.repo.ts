import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';

/**
 * L07 write queries: the transactional parent+children insert, and the
 * `completed_at` stamp. Read queries for the multi-agent batch live in
 * `./multi-run-read.repo.ts` (WU-3's lease); this file is WU-5's.
 */

/**
 * Create one `multi_agent_runs` parent plus its `agent_runs` children, all in
 * ONE transaction — so a batch is either fully visible or not at all. Children
 * are created `status:'running'`, `source:'local'`, with `multiAgentPosition`
 * set to their 0-based submission index (criteria 43/47: the batch order is
 * otherwise unrecoverable — `ranAt` ties within one transaction and the uuid
 * PK is random).
 */
export async function createMultiAgentRun(
  db: Db,
  values: {
    workspaceId: string;
    prId: string;
    children: { agentId: string; provider: string | null; model: string | null }[];
  },
): Promise<{ multiAgentRunId: string; runIds: string[] }> {
  return db.transaction(async (tx) => {
    const [parent] = await tx
      .insert(t.multiAgentRuns)
      .values({ workspaceId: values.workspaceId, prId: values.prId })
      .returning({ id: t.multiAgentRuns.id });
    const multiAgentRunId = parent!.id;

    const rows = await tx
      .insert(t.agentRuns)
      .values(
        values.children.map((child, i) => ({
          workspaceId: values.workspaceId,
          agentId: child.agentId,
          prId: values.prId,
          provider: child.provider,
          model: child.model,
          status: 'running' as const,
          source: 'local' as const,
          multiAgentRunId,
          multiAgentPosition: i,
        })),
      )
      .returning({ id: t.agentRuns.id, multiAgentPosition: t.agentRuns.multiAgentPosition });

    // Preserve input order regardless of what order Postgres returns rows in —
    // `runIds[i]` must correspond to `values.children[i]` (§3 contract).
    const byPosition = new Map(rows.map((r) => [r.multiAgentPosition, r.id]));
    const runIds = values.children.map((_, i) => byPosition.get(i)!);

    return { multiAgentRunId, runIds };
  });
}

/** Stamp `completed_at` once, after settle-all (single writer, no race). */
export async function markMultiAgentRunCompleted(
  db: Db,
  workspaceId: string,
  multiAgentRunId: string,
): Promise<void> {
  await db
    .update(t.multiAgentRuns)
    .set({ completedAt: new Date() })
    .where(
      and(
        eq(t.multiAgentRuns.id, multiAgentRunId),
        eq(t.multiAgentRuns.workspaceId, workspaceId),
        isNull(t.multiAgentRuns.completedAt),
      ),
    );
}
