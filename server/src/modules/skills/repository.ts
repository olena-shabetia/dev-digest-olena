import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { INITIAL_SKILL_VERSION } from './constants.js';
import { isBodyChange } from './helpers.js';

/**
 * List-view usage aggregates for one skill (HW2 criteria 22-24) — see the
 * `Skill` contract's doc comment for why `pullFreq`/`acceptRate` are an
 * approximation keyed off CURRENTLY linked agents, not a true per-run join.
 */
export interface SkillUsage {
  agentCount: number;
  pullFreq: number | null;
  acceptRate: number | null;
}

/**
 * L02 — skills data-access. Owns `skills` and `skill_versions` (the agents
 * repository keeps owning the agent side of `agent_skills` — link/reorder/list
 * for an agent; see `agents/repository.ts:8-12`). Workspace-scoped throughout.
 */

export type SkillRow = typeof t.skills.$inferSelect;
export type SkillVersionRow = typeof t.skillVersions.$inferSelect;

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: string;
  source: string;
  body: string;
  enabled?: boolean;
  evidenceFiles?: string[];
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: string;
  source?: string;
  body?: string;
  enabled?: boolean;
  evidenceFiles?: string[];
}

export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db.select().from(t.skills).where(eq(t.skills.workspaceId, workspaceId));
  }

  /**
   * Every skill for the workspace, plus usage aggregates for the list view's
   * "⚙ N agents" badge and "pull freq · accept" pair — three queries total
   * (list + one grouped agent-count query + one grouped review/finding
   * query), not N. See `SkillUsage`'s doc comment for the approximation this
   * makes in the absence of a per-run skill-attribution table.
   */
  async listWithUsage(workspaceId: string): Promise<Array<SkillRow & SkillUsage>> {
    const rows = await this.list(workspaceId);
    if (rows.length === 0) return [];

    const agentCounts = await this.db
      .select({ skillId: t.agentSkills.skillId, count: sql<number>`count(*)::int` })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(eq(t.agents.workspaceId, workspaceId))
      .groupBy(t.agentSkills.skillId);
    const agentCountBySkill = new Map(agentCounts.map((r) => [r.skillId, r.count]));

    const [totalRow] = await this.db
      .select({ totalReviews: sql<number>`count(*)::int` })
      .from(t.reviews)
      .where(and(eq(t.reviews.workspaceId, workspaceId), eq(t.reviews.kind, 'review')));
    const totalReviews = totalRow?.totalReviews ?? 0;

    const usageRows =
      totalReviews === 0
        ? []
        : await this.db
            .select({
              skillId: t.agentSkills.skillId,
              reviewCount: sql<number>`count(distinct ${t.reviews.id})::int`,
              findingCount: sql<number>`count(${t.findings.id})::int`,
              acceptedCount: sql<number>`count(${t.findings.id}) filter (where ${t.findings.acceptedAt} is not null)::int`,
            })
            .from(t.agentSkills)
            .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
            .innerJoin(
              t.reviews,
              and(
                eq(t.reviews.agentId, t.agents.id),
                eq(t.reviews.workspaceId, workspaceId),
                eq(t.reviews.kind, 'review'),
              ),
            )
            .leftJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
            .where(eq(t.agents.workspaceId, workspaceId))
            .groupBy(t.agentSkills.skillId);
    const usageBySkill = new Map(usageRows.map((r) => [r.skillId, r]));

    return rows.map((row) => {
      const usage = usageBySkill.get(row.id);
      return {
        ...row,
        agentCount: agentCountBySkill.get(row.id) ?? 0,
        pullFreq: totalReviews === 0 ? null : (usage?.reviewCount ?? 0) / totalReviews,
        acceptRate: usage && usage.findingCount > 0 ? usage.acceptedCount / usage.findingCount : null,
      };
    });
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /** Delete a skill (scoped to workspace). `skill_versions` and `agent_skills`
   *  links cascade (both FKs are `onDelete: 'cascade'`). Returns false if no
   *  such skill existed in the workspace. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /** Insert a skill AND record version 1 in skill_versions (immutable snapshot). */
  async insert(values: InsertSkill): Promise<SkillRow> {
    const [row] = await this.db
      .insert(t.skills)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description,
        type: values.type as SkillRow['type'],
        source: values.source as SkillRow['source'],
        body: values.body,
        enabled: values.enabled ?? true,
        version: INITIAL_SKILL_VERSION,
        ...(values.evidenceFiles !== undefined ? { evidenceFiles: values.evidenceFiles } : {}),
      })
      .returning();
    await this.snapshotVersion(row!, INITIAL_SKILL_VERSION, null);
    return row!;
  }

  /**
   * Update a skill. A `body` change bumps the version and snapshots the new
   * body into skill_versions; changes to only name/description/enabled/type do
   * not. `changeNote` is captured on the new snapshot only when a bump happens.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
    changeNote?: string | null,
  ): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const bodyChanged = isBodyChange(existing, patch);
    const nextVersion = bodyChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.skills)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type as SkillRow['type'] } : {}),
        ...(patch.source !== undefined ? { source: patch.source as SkillRow['source'] } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.evidenceFiles !== undefined ? { evidenceFiles: patch.evidenceFiles } : {}),
        ...(bodyChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();

    if (bodyChanged && row) await this.snapshotVersion(row, nextVersion, changeNote ?? null);
    return row;
  }

  private async snapshotVersion(
    row: SkillRow,
    version: number,
    changeNote: string | null,
  ): Promise<void> {
    await this.db
      .insert(t.skillVersions)
      .values({
        skillId: row.id,
        version,
        body: row.body,
        changeNote,
      })
      .onConflictDoNothing();
  }

  // ---- skill_versions (immutable body snapshots) ---------------------------

  /** All body snapshots for a skill, newest version first. */
  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  // ---- stats ----------------------------------------------------------------

  /** Agents currently linked to this skill (id + name), for GET /skills/:id/stats. */
  async agentsUsingSkill(skillId: string): Promise<{ id: string; name: string }[]> {
    const rows = await this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(eq(t.agentSkills.skillId, skillId));
    return rows;
  }
}
