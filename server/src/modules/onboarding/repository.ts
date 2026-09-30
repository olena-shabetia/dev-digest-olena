import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { FeatureModelChoice, type OnboardingTourContent } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { ONBOARDING_GENERATE_JOB_KIND } from './constants.js';
import type { OnboardingRow } from './types.js';

/**
 * Onboarding data-access — owns the `onboarding` table. Workspace-scoped
 * throughout (server/AGENTS.md). Reads `repos`, `settings` and `jobs` directly
 * through the shared Drizzle schema barrel (schema access, not a cross-module
 * import — same precedent as `conventions/repository.ts`). NEVER queries a
 * repo-intel table: those reads go through `container.repoIntel`.
 */

export interface RepoInfo {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string;
  clonePath: string | null;
}

/** Everything `upsertTour` writes; `generatedAt` is always stamped by the repository. */
export interface UpsertTourValues {
  status: 'ready' | 'skeleton';
  reason: string | null;
  content: OnboardingTourContent;
  indexSha: string | null;
  provider: string | null;
  model: string | null;
  llmCalls: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
}

export class OnboardingRepository {
  constructor(private db: Db) {}

  /** Repo basics scoped to the workspace — `undefined` when it isn't this tenant's. */
  async getRepo(workspaceId: string, repoId: string): Promise<RepoInfo | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        defaultBranch: t.repos.defaultBranch,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row ?? undefined;
  }

  /** Settings → Feature Models override for `'onboarding'`, or `undefined` when unset. */
  async getModelOverride(workspaceId: string): Promise<FeatureModelChoice | undefined> {
    const rows = await this.db
      .select({ key: t.settings.key, value: t.settings.value })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId));
    const settings: Record<string, unknown> = {};
    for (const r of rows) settings[r.key] = r.value;
    const fm = (settings as { feature_models?: Record<string, unknown> }).feature_models;
    const parsed = FeatureModelChoice.safeParse(fm?.onboarding);
    return parsed.success ? parsed.data : undefined;
  }

  async getTour(workspaceId: string, repoId: string): Promise<OnboardingRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.onboarding)
      .where(and(eq(t.onboarding.workspaceId, workspaceId), eq(t.onboarding.repoId, repoId)));
    return row ?? undefined;
  }

  /** One row per repo (`repo_id` is the PK): insert, or overwrite every column. */
  async upsertTour(workspaceId: string, repoId: string, values: UpsertTourValues): Promise<void> {
    const cols = {
      workspaceId,
      json: values.content,
      status: values.status,
      reason: values.reason,
      indexSha: values.indexSha,
      provider: values.provider,
      model: values.model,
      llmCalls: values.llmCalls,
      tokensIn: values.tokensIn,
      tokensOut: values.tokensOut,
      costUsd: values.costUsd,
      generatedAt: new Date(),
    };
    await this.db
      .insert(t.onboarding)
      .values({ repoId, ...cols })
      .onConflictDoUpdate({ target: t.onboarding.repoId, set: cols });
  }

  /** A queued/running generation job for this repo newer than `staleBefore`. */
  async findInflightJob(
    workspaceId: string,
    repoId: string,
    staleBefore: Date,
  ): Promise<{ id: string } | undefined> {
    const [row] = await this.db
      .select({ id: t.jobs.id })
      .from(t.jobs)
      .where(
        and(
          eq(t.jobs.workspaceId, workspaceId),
          eq(t.jobs.kind, ONBOARDING_GENERATE_JOB_KIND),
          inArray(t.jobs.status, ['queued', 'running']),
          sql`${t.jobs.payload}->>'repoId' = ${repoId}`,
          gt(t.jobs.scheduledAt, staleBefore),
        ),
      )
      .orderBy(desc(t.jobs.scheduledAt))
      .limit(1);
    return row ?? undefined;
  }
}
