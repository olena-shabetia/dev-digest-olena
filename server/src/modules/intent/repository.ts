import { and, eq } from 'drizzle-orm';
import { FeatureModelChoice } from '@devdigest/shared';
import type { IntentSource } from '@devdigest/shared';
import type { z } from 'zod';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Intent data-access — owns `pr_intent`. Every query scoped by
 * `workspace_id` (server/AGENTS.md). Also reads the shared `pull_requests` /
 * `pr_files` / `pr_commits` / `repos` tables directly (schema-barrel access,
 * not a cross-module import of another module's `repository.ts`/`service.ts`
 * classes — same pattern `conventions/repository.ts` uses for
 * `repo_index_state`) and the shared `settings` table for the Feature
 * Models override, mirroring `conventions/repository.ts:76-86` exactly
 * (server/INSIGHTS.md, 2026-09-21 — a bare function import of
 * `settings/feature-models.ts` trips `no-cross-module-imports`; wrapping it
 * as a `Container` method trips `no-circular` instead).
 */

export type PrIntentRow = typeof t.prIntent.$inferSelect;

export interface PullForIntent {
  id: string;
  repoId: string;
  number: number;
  title: string;
  body: string | null;
  headSha: string;
  repoOwner: string;
  repoName: string;
  clonePath: string | null;
}

export interface UpsertIntentPatch {
  intent: string;
  inScope: string[];
  outOfScope: string[];
  sources: IntentSource[];
  confidence: string;
  contextGaps: string[];
  headSha: string | null;
  provider: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  error: string | null;
  generatedAt: Date | null;
}

export class IntentRepository {
  constructor(private db: Db) {}

  async getIntent(workspaceId: string, prId: string): Promise<PrIntentRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.prIntent)
      .where(and(eq(t.prIntent.workspaceId, workspaceId), eq(t.prIntent.prId, prId)));
    return row ?? undefined;
  }

  async upsertIntent(workspaceId: string, prId: string, patch: UpsertIntentPatch): Promise<PrIntentRow> {
    const values = {
      prId,
      workspaceId,
      intent: patch.intent,
      inScope: patch.inScope,
      outOfScope: patch.outOfScope,
      sources: patch.sources,
      confidence: patch.confidence,
      contextGaps: patch.contextGaps,
      headSha: patch.headSha,
      provider: patch.provider,
      model: patch.model,
      tokensIn: patch.tokensIn,
      tokensOut: patch.tokensOut,
      costUsd: patch.costUsd,
      error: patch.error,
      generatedAt: patch.generatedAt,
    };
    const [row] = await this.db
      .insert(t.prIntent)
      .values(values)
      .onConflictDoUpdate({ target: t.prIntent.prId, set: values })
      .returning();
    return row!;
  }

  /**
   * The workspace's Settings → Feature Models override for `'review_intent'`,
   * or `undefined` when unset. Reads the shared `settings` table directly
   * rather than importing `modules/settings/feature-models.ts`.
   */
  async getIntentModelOverride(workspaceId: string): Promise<z.infer<typeof FeatureModelChoice> | undefined> {
    const rows = await this.db
      .select({ key: t.settings.key, value: t.settings.value })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId));
    const settingsMap: Record<string, unknown> = {};
    for (const r of rows) settingsMap[r.key] = r.value;
    const fm = (settingsMap as { feature_models?: Record<string, unknown> }).feature_models;
    const parsed = FeatureModelChoice.safeParse(fm?.review_intent);
    return parsed.success ? parsed.data : undefined;
  }

  /** PR basics + owning repo, scoped to the workspace — 404-worthy
   *  `undefined` if the PR doesn't belong to this tenant. */
  async getPullForIntent(workspaceId: string, prId: string): Promise<PullForIntent | undefined> {
    const [row] = await this.db
      .select({
        id: t.pullRequests.id,
        repoId: t.pullRequests.repoId,
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        body: t.pullRequests.body,
        headSha: t.pullRequests.headSha,
        repoOwner: t.repos.owner,
        repoName: t.repos.name,
        clonePath: t.repos.clonePath,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row ?? undefined;
  }

  async getPrFilePaths(prId: string): Promise<string[]> {
    const rows = await this.db.select({ path: t.prFiles.path }).from(t.prFiles).where(eq(t.prFiles.prId, prId));
    return rows.map((r) => r.path);
  }

  async getPrCommitMessages(prId: string): Promise<string[]> {
    const rows = await this.db.select({ message: t.prCommits.message }).from(t.prCommits).where(eq(t.prCommits.prId, prId));
    return rows.map((r) => r.message);
  }
}
