import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { AgentStats, CiFailOn, Provider, ReviewStrategy, StatPoint } from '@devdigest/shared';
import { DEFAULT_AGENT_DESCRIPTION, INITIAL_AGENT_VERSION } from './constants.js';
import { isConfigChange } from './helpers.js';

/**
 * A2 — agents data-access. Owns `agents`, `agent_versions`, and the
 * `agent_skills` link table (shared with A1's skills repository, but A2 owns the
 * agent side: link/reorder/list for an agent). Workspace-scoped throughout.
 */

import type { AgentRow, AgentVersionRow } from '../../db/rows.js';
export type { AgentRow, AgentVersionRow };

export interface InsertAgent {
  workspaceId: string;
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
  createdBy?: string | null;
}

export interface UpdateAgent {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
}

/** A skill linked to an agent (with its order), joined from agent_skills. */
export interface LinkedSkillRow {
  skill: typeof t.skills.$inferSelect;
  order: number;
}

export class AgentsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<AgentRow[]> {
    return this.db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
  }

  async listEnabled(workspaceId: string): Promise<AgentRow[]> {
    return this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)));
  }

  async getById(workspaceId: string, id: string): Promise<AgentRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)));
    return row;
  }

  /** Delete an agent (scoped to workspace). Versions/skill-links cascade;
   *  agent_runs keep their history with agent_id set null. Returns false if
   *  no such agent existed in the workspace. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning({ id: t.agents.id });
    return rows.length > 0;
  }

  /** Insert an agent AND record version 1 in agent_versions (immutable snapshot). */
  async insert(values: InsertAgent): Promise<AgentRow> {
    const [row] = await this.db
      .insert(t.agents)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description ?? DEFAULT_AGENT_DESCRIPTION,
        provider: values.provider,
        model: values.model,
        systemPrompt: values.systemPrompt,
        outputSchema: (values.outputSchema as object | undefined) ?? null,
        ...(values.strategy !== undefined ? { strategy: values.strategy } : {}),
        ...(values.ciFailOn !== undefined ? { ciFailOn: values.ciFailOn } : {}),
        ...(values.repoIntel !== undefined ? { repoIntel: values.repoIntel } : {}),
        enabled: values.enabled ?? true,
        version: INITIAL_AGENT_VERSION,
        createdBy: values.createdBy ?? null,
      })
      .returning();
    await this.snapshotVersion(row!, INITIAL_AGENT_VERSION);
    return row!;
  }

  /**
   * Update an agent. Any config change bumps the version and snapshots the new
   * config into agent_versions (reproducibility for eval).
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateAgent,
  ): Promise<AgentRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    // A config-affecting change (anything except just toggling enabled) bumps version.
    const configChanged = isConfigChange(existing, patch);
    const nextVersion = configChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.agents)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
        ...(patch.model !== undefined ? { model: patch.model } : {}),
        ...(patch.systemPrompt !== undefined ? { systemPrompt: patch.systemPrompt } : {}),
        ...(patch.outputSchema !== undefined
          ? { outputSchema: patch.outputSchema as object }
          : {}),
        ...(patch.strategy !== undefined ? { strategy: patch.strategy } : {}),
        ...(patch.ciFailOn !== undefined ? { ciFailOn: patch.ciFailOn } : {}),
        ...(patch.repoIntel !== undefined ? { repoIntel: patch.repoIntel } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(configChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning();

    if (configChanged && row) await this.snapshotVersion(row, nextVersion);
    return row;
  }

  private async snapshotVersion(row: AgentRow, version: number): Promise<void> {
    const skills = await this.skillIdsForAgent(row.id);
    await this.db
      .insert(t.agentVersions)
      .values({
        agentId: row.id,
        version,
        configJson: {
          provider: row.provider,
          model: row.model,
          system_prompt: row.systemPrompt,
          output_schema: row.outputSchema,
          strategy: row.strategy,
          ci_fail_on: row.ciFailOn,
          repo_intel: row.repoIntel,
          skills,
        },
      })
      .onConflictDoNothing();
  }

  // ---- agent_versions (immutable config snapshots) ------------------------

  /** All config snapshots for an agent, newest version first. */
  async listVersions(agentId: string): Promise<AgentVersionRow[]> {
    return this.db
      .select()
      .from(t.agentVersions)
      .where(eq(t.agentVersions.agentId, agentId))
      .orderBy(desc(t.agentVersions.version));
  }

  /** A single config snapshot, or undefined if that version was never recorded. */
  async getVersion(agentId: string, version: number): Promise<AgentVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agentVersions)
      .where(and(eq(t.agentVersions.agentId, agentId), eq(t.agentVersions.version, version)));
    return row;
  }

  // ---- agent_skills link table (A2 owns the agent side) -------------------

  /** Skills linked to an agent, in `order` ascending. */
  async linkedSkills(agentId: string): Promise<LinkedSkillRow[]> {
    const rows = await this.db
      .select({ skill: t.skills, order: t.agentSkills.order })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agentId))
      .orderBy(asc(t.agentSkills.order));
    return rows.map((r) => ({ skill: r.skill, order: r.order }));
  }

  async skillIdsForAgent(agentId: string): Promise<string[]> {
    const links = await this.linkedSkills(agentId);
    return links.map((l) => l.skill.id);
  }

  /** Link a skill to an agent at a given order (idempotent: upserts order). */
  async linkSkill(agentId: string, skillId: string, order: number): Promise<void> {
    await this.db
      .insert(t.agentSkills)
      .values({ agentId, skillId, order })
      .onConflictDoUpdate({
        target: [t.agentSkills.agentId, t.agentSkills.skillId],
        set: { order },
      });
  }

  async unlinkSkill(agentId: string, skillId: string): Promise<void> {
    await this.db
      .delete(t.agentSkills)
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.agentSkills.skillId, skillId)));
  }

  /**
   * Replace the full set of linked skills for an agent with `skillIds`, assigning
   * order = index. Used by the "Skills" editor tab (attach/reorder). Skills not in
   * the list are unlinked.
   */
  async setSkills(agentId: string, skillIds: string[]): Promise<void> {
    await this.db.delete(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
    if (skillIds.length === 0) return;
    await this.db
      .insert(t.agentSkills)
      .values(skillIds.map((skillId, i) => ({ agentId, skillId, order: i })));
  }

  // ---- Agent Stats (GET /agents/:id/stats, L02) ----------------------------

  /**
   * Per-agent quality/cost aggregates (`AgentStats`, `contracts/observability.ts`).
   *
   * IMPORTANT — two different time windows are mixed into one DTO, because
   * `AgentStats` has no separate field to make this explicit from the contract
   * alone:
   *   - `runs`, `total_cost_usd`, `avg_cost_usd`, `avg_latency_ms`, `trend` are
   *     windowed to the last 30 days of `agent_runs` (workspace_id + agent_id).
   *   - `findings_total`, `accepted`, `dismissed`, `pending`, `accept_rate`,
   *     `dismiss_rate`, `avg_findings_per_run`, `findings_by_severity`,
   *     `findings_by_category` are ALL-TIME — findings carry no `ran_at` of
   *     their own, so they're joined via `findings.review_id -> reviews.id`
   *     where `reviews.workspace_id`/`reviews.agent_id` match, unwindowed.
   * `avg_findings_per_run` divides the all-time `findings_total` by the
   * 30-day `runs` count, per spec — it is intentionally a mixed-window ratio.
   *
   * `agentName` is passed in by the caller (already loaded for the 404 check)
   * rather than re-queried here.
   */
  async agentStats(workspaceId: string, agentId: string, agentName: string): Promise<AgentStats> {
    // ---- 30-day window: agent_runs -----------------------------------------
    const runRows = await this.db
      .select({
        ranAt: t.agentRuns.ranAt,
        durationMs: t.agentRuns.durationMs,
        costUsd: t.agentRuns.costUsd,
      })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.agentId, agentId),
          sql`${t.agentRuns.ranAt} >= now() - interval '30 days'`,
        ),
      );

    const runs = runRows.length;
    const costs = runRows.map((r) => r.costUsd).filter((c): c is number => c != null);
    const totalCostUsd = costs.length > 0 ? costs.reduce((a, b) => a + b, 0) : null;
    const avgCostUsd = costs.length > 0 ? totalCostUsd! / costs.length : null;
    const durations = runRows.map((r) => r.durationMs).filter((d): d is number => d != null);
    const avgLatencyMs =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;

    // One point per day for the last 30 days, oldest -> newest, value = that
    // day's run count (UTC day buckets).
    const dayCounts = new Map<string, number>();
    for (const row of runRows) {
      if (!row.ranAt) continue;
      const day = row.ranAt.toISOString().slice(0, 10);
      dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    }
    const trend: StatPoint[] = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i),
      );
      const label = d.toISOString().slice(0, 10);
      trend.push({ label, value: dayCounts.get(label) ?? 0 });
    }

    // ---- all-time: findings joined through reviews -------------------------
    const findingRows = await this.db
      .select({
        severity: t.findings.severity,
        category: t.findings.category,
        acceptedAt: t.findings.acceptedAt,
        dismissedAt: t.findings.dismissedAt,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .where(and(eq(t.reviews.workspaceId, workspaceId), eq(t.reviews.agentId, agentId)));

    const findingsTotal = findingRows.length;
    const accepted = findingRows.filter((f) => f.acceptedAt != null).length;
    const dismissed = findingRows.filter((f) => f.dismissedAt != null).length;
    const pending = findingsTotal - accepted - dismissed;
    const actedDenom = accepted + dismissed;
    const acceptRate = actedDenom > 0 ? accepted / actedDenom : null;
    const dismissRate = actedDenom > 0 ? dismissed / actedDenom : null;
    const avgFindingsPerRun = runs > 0 ? findingsTotal / runs : null;

    const findingsBySeverity = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
    const findingsByCategory: Record<string, number> = {};
    for (const f of findingRows) {
      if (f.severity === 'CRITICAL' || f.severity === 'WARNING' || f.severity === 'SUGGESTION') {
        findingsBySeverity[f.severity] += 1;
      }
      findingsByCategory[f.category] = (findingsByCategory[f.category] ?? 0) + 1;
    }

    return {
      agent_id: agentId,
      agent_name: agentName,
      runs,
      findings_total: findingsTotal,
      accepted,
      dismissed,
      pending,
      accept_rate: acceptRate,
      dismiss_rate: dismissRate,
      avg_findings_per_run: avgFindingsPerRun,
      total_cost_usd: totalCostUsd,
      avg_cost_usd: avgCostUsd,
      avg_latency_ms: avgLatencyMs,
      findings_by_severity: findingsBySeverity,
      findings_by_category: findingsByCategory,
      trend,
    };
  }
}
