import { and, desc, eq, inArray } from 'drizzle-orm';
import { FeatureModelChoice, ConventionCategory } from '@devdigest/shared';
import type { z } from 'zod';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { MergedCandidate, RepoCloneInfo } from './types.js';

/**
 * Conventions data-access — owns `conventions` + `convention_scans`.
 * Workspace-scoped throughout (server/AGENTS.md). Reads `repo_index_state`
 * (owned by repo-intel's schema, not its module) directly via the shared
 * Drizzle schema barrel — that's schema access, not a cross-module import of
 * repo-intel's `repository.ts`/`service.ts` classes, so it doesn't trip
 * `.dependency-cruiser.cjs`'s `no-cross-module-imports` rule.
 */

export type ConventionRow = typeof t.conventions.$inferSelect;
export type ConventionScanRow = typeof t.conventionScans.$inferSelect;

export interface InsertScan {
  workspaceId: string;
  repoId: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  sha?: string | null;
  provider?: string | null;
  model?: string | null;
}

export interface UpdateScan {
  status?: 'queued' | 'running' | 'done' | 'failed';
  provider?: string | null;
  model?: string | null;
  candidatesProposed?: number;
  candidatesVerified?: number;
  degraded?: boolean;
  degradedReason?: string | null;
  error?: string | null;
  finishedAt?: Date;
}

export interface UpdateCandidate {
  status?: 'pending' | 'accepted' | 'rejected';
  rule?: string;
  category?: z.infer<typeof ConventionCategory>;
  edited?: boolean;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  /** Repo basics scoped to the workspace — 404-worthy `undefined` if the
   *  repo doesn't belong to this tenant. */
  async getRepoCloneInfo(workspaceId: string, repoId: string): Promise<RepoCloneInfo | undefined> {
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

  /**
   * The workspace's Settings → Feature Models override for `'conventions'`,
   * or `undefined` when unset. Reads the shared `settings` table directly
   * (same pattern as `getLastIndexedSha` reading `repo_index_state`) rather
   * than importing `modules/settings/feature-models.ts` — a bare function
   * import across `src/modules/<a>/` → `src/modules/<b>/` trips
   * `no-cross-module-imports` (`tsPreCompilationDeps: true`) exactly the
   * same as a class import (server/INSIGHTS.md, 2026-09-21).
   */
  async getConventionsModelOverride(workspaceId: string): Promise<FeatureModelChoice | undefined> {
    const rows = await this.db
      .select({ key: t.settings.key, value: t.settings.value })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId));
    const settings: Record<string, unknown> = {};
    for (const r of rows) settings[r.key] = r.value;
    const fm = (settings as { feature_models?: Record<string, unknown> }).feature_models;
    const parsed = FeatureModelChoice.safeParse(fm?.conventions);
    return parsed.success ? parsed.data : undefined;
  }

  /** `repo_index_state.last_indexed_sha`, or `null` if the repo was never
   *  indexed (tolerant — the extractor degrades rather than throwing). */
  async getLastIndexedSha(repoId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ sha: t.repoIndexState.lastIndexedSha })
      .from(t.repoIndexState)
      .where(eq(t.repoIndexState.repoId, repoId));
    return row?.sha ?? null;
  }

  async insertScan(values: InsertScan): Promise<ConventionScanRow> {
    const [row] = await this.db
      .insert(t.conventionScans)
      .values({
        workspaceId: values.workspaceId,
        repoId: values.repoId,
        status: values.status,
        sha: values.sha ?? null,
        provider: values.provider ?? null,
        model: values.model ?? null,
      })
      .returning();
    return row!;
  }

  async updateScan(id: string, patch: UpdateScan): Promise<void> {
    await this.db
      .update(t.conventionScans)
      .set({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
        ...(patch.model !== undefined ? { model: patch.model } : {}),
        ...(patch.candidatesProposed !== undefined ? { candidatesProposed: patch.candidatesProposed } : {}),
        ...(patch.candidatesVerified !== undefined ? { candidatesVerified: patch.candidatesVerified } : {}),
        ...(patch.degraded !== undefined ? { degraded: patch.degraded } : {}),
        ...(patch.degradedReason !== undefined ? { degradedReason: patch.degradedReason } : {}),
        ...(patch.error !== undefined ? { error: patch.error } : {}),
        ...(patch.finishedAt !== undefined ? { finishedAt: patch.finishedAt } : {}),
      })
      .where(eq(t.conventionScans.id, id));
  }

  /** Most recent scan for a repo (any status) — restart-durable "last scan"
   *  read for `GET /repos/:id/conventions` (criterion 38). */
  async getLatestScan(workspaceId: string, repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(and(eq(t.conventionScans.workspaceId, workspaceId), eq(t.conventionScans.repoId, repoId)))
      .orderBy(desc(t.conventionScans.createdAt))
      .limit(1);
    return row ?? undefined;
  }

  async getScanById(workspaceId: string, id: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(and(eq(t.conventionScans.workspaceId, workspaceId), eq(t.conventionScans.id, id)));
    return row ?? undefined;
  }

  /**
   * Replace every `pending` candidate row for the repo with the newly
   * verified+merged set from this scan, in one transaction — but PRESERVE
   * any row already `accepted`/`rejected` (criterion 48: a re-scan must not
   * discard a human decision). Empty `merged` is valid (a degraded/zero-yield
   * scan) and simply clears stale pending rows.
   */
  async replacePendingCandidates(
    workspaceId: string,
    repoId: string,
    scanId: string,
    sha: string | null,
    merged: MergedCandidate[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, workspaceId),
            eq(t.conventions.repoId, repoId),
            eq(t.conventions.status, 'pending'),
          ),
        );
      if (merged.length === 0) return;
      await tx.insert(t.conventions).values(
        merged.map((m) => {
          const primary = m.evidences[0];
          return {
            workspaceId,
            repoId,
            scanId,
            category: m.category,
            rule: m.rule,
            evidencePath: primary?.path ?? null,
            evidenceLine: primary?.line ?? null,
            evidenceSnippet: primary?.snippet ?? null,
            evidenceSha: primary?.sha ?? sha,
            evidences: m.evidences,
            confidence: m.confidence,
            status: 'pending' as const,
            edited: false,
          };
        }),
      );
    });
  }

  async listCandidates(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.confidence));
  }

  async listAcceptedCandidates(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'accepted'),
        ),
      );
  }

  async getCandidateById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row ?? undefined;
  }

  async updateCandidate(workspaceId: string, id: string, patch: UpdateCandidate): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.edited !== undefined ? { edited: patch.edited } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row ?? undefined;
  }

  /** Fetch a repo (for the DTO mapper's owner/name) by id only — used when a
   *  candidate/scan's `repoId` is already workspace-verified upstream. */
  async getRepoBlobRef(repoId: string): Promise<{ owner: string; name: string } | undefined> {
    const [row] = await this.db
      .select({ owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(eq(t.repos.id, repoId));
    return row ?? undefined;
  }

  /** Batch variant of `getRepoBlobRef`, for mapping a list of candidates that
   *  may (in theory) span more than one repo id. */
  async getRepoBlobRefsFor(repoIds: string[]): Promise<Map<string, { owner: string; name: string }>> {
    if (repoIds.length === 0) return new Map();
    const rows = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(inArray(t.repos.id, repoIds));
    return new Map(rows.map((r) => [r.id, { owner: r.owner, name: r.name }]));
  }
}
