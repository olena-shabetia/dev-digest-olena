import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CiRunRowLike, InstallationRowLike, IngestRecord, LatestRunLike } from './helpers.js';

/**
 * CI data-access — `ci_installations` + `ci_runs`, plus the `agent_runs` row an
 * ingested run mirrors. Every query is scoped by `workspace_id`. Reads `repos`
 * and writes `agent_runs` directly through the schema barrel (schema access,
 * not a cross-module import — the `conventions/repository.ts` precedent).
 * Also joins `agents` for a display-name lookup only (read-only; list queries
 * need the name per row, so a per-row `agentsRepo` call would be N+1).
 */

export type InstallationRow = typeof t.ciInstallations.$inferSelect;

export interface InstallationWithAgent extends InstallationRowLike {
  agentSlug: string;
  githubRepoId: number;
}

export interface UpsertInstallation {
  agentId: string;
  agentSlug: string;
  repo: string;
  githubRepoId: number;
  prUrl: string;
  agentVersion: number;
}

export interface InstallationWithLatest {
  installation: InstallationWithAgent;
  latest: LatestRunLike | null;
}

export class CiRepository {
  constructor(private readonly db: Db) {}

  async findRepoByFullName(
    workspaceId: string,
    fullName: string,
  ): Promise<{ id: string; owner: string; name: string; fullName: string; defaultBranch: string } | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        defaultBranch: t.repos.defaultBranch,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, fullName)));
    return row;
  }

  async getInstallationByRepo(
    workspaceId: string,
    repo: string,
  ): Promise<InstallationWithAgent | undefined> {
    const [row] = await this.db
      .select({ inst: t.ciInstallations, agentName: t.agents.name })
      .from(t.ciInstallations)
      .leftJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(and(eq(t.ciInstallations.workspaceId, workspaceId), eq(t.ciInstallations.repo, repo)));
    return row ? toInstallation(row.inst, row.agentName) : undefined;
  }

  /** Upsert on `(workspace_id, repo)`. Keeps `agent_slug` when the row exists. */
  async upsertInstallation(
    workspaceId: string,
    input: UpsertInstallation,
  ): Promise<InstallationWithAgent> {
    const [row] = await this.db
      .insert(t.ciInstallations)
      .values({
        workspaceId,
        agentId: input.agentId,
        agentSlug: input.agentSlug,
        repo: input.repo,
        githubRepoId: input.githubRepoId,
        targetType: 'gha',
        prUrl: input.prUrl,
        agentVersion: input.agentVersion,
      })
      .onConflictDoUpdate({
        target: [t.ciInstallations.workspaceId, t.ciInstallations.repo],
        set: {
          agentId: input.agentId,
          agentVersion: input.agentVersion,
          prUrl: input.prUrl,
          githubRepoId: input.githubRepoId,
          updatedAt: new Date(),
        },
      })
      .returning();
    const [agent] = await this.db
      .select({ name: t.agents.name })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, input.agentId)));
    return toInstallation(row!, agent?.name ?? null);
  }

  /** Installations (optionally one agent's), each with its newest run. */
  async listInstallations(
    workspaceId: string,
    opts: { agentId?: string } = {},
  ): Promise<InstallationWithLatest[]> {
    const where = opts.agentId
      ? and(
          eq(t.ciInstallations.workspaceId, workspaceId),
          eq(t.ciInstallations.agentId, opts.agentId),
        )
      : eq(t.ciInstallations.workspaceId, workspaceId);
    const rows = await this.db
      .select({ inst: t.ciInstallations, agentName: t.agents.name })
      .from(t.ciInstallations)
      .leftJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(where)
      .orderBy(desc(t.ciInstallations.updatedAt));
    if (rows.length === 0) return [];

    const latestRows = await this.db
      .selectDistinctOn([t.ciRuns.ciInstallationId], {
        installationId: t.ciRuns.ciInstallationId,
        status: t.ciRuns.status,
        verdict: t.ciRuns.verdict,
        ranAt: t.ciRuns.ranAt,
      })
      .from(t.ciRuns)
      .where(
        and(
          eq(t.ciRuns.workspaceId, workspaceId),
          inArray(
            t.ciRuns.ciInstallationId,
            rows.map((r) => r.inst.id),
          ),
        ),
      )
      .orderBy(t.ciRuns.ciInstallationId, desc(t.ciRuns.ranAt));
    const latestById = new Map(latestRows.map((r) => [r.installationId, r]));

    return rows.map((r) => ({
      installation: toInstallation(r.inst, r.agentName),
      latest: latestById.get(r.inst.id) ?? null,
    }));
  }

  /** `"<workflow_run_id>:<run_attempt>"` keys already ingested for these runs. */
  async knownRunKeys(workspaceId: string, workflowRunIds: number[]): Promise<Set<string>> {
    if (workflowRunIds.length === 0) return new Set();
    const rows = await this.db
      .select({ id: t.ciRuns.workflowRunId, attempt: t.ciRuns.runAttempt })
      .from(t.ciRuns)
      .where(
        and(eq(t.ciRuns.workspaceId, workspaceId), inArray(t.ciRuns.workflowRunId, workflowRunIds)),
      );
    return new Set(rows.map((r) => `${r.id}:${r.attempt}`));
  }

  /**
   * Write-once: insert `ci_runs` ON CONFLICT DO NOTHING; when it lands, insert
   * the finished `agent_runs` row and link them, in one transaction. Returns
   * false when the (workflow run, attempt) was already recorded.
   */
  async insertIngestedRun(workspaceId: string, rec: IngestRecord): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [ci] = await tx
        .insert(t.ciRuns)
        .values({
          workspaceId,
          ciInstallationId: rec.installationId,
          repo: rec.repo,
          workflowRunId: rec.workflowRunId,
          runAttempt: rec.runAttempt,
          headSha: rec.headSha,
          conclusion: rec.conclusion,
          verdict: rec.verdict,
          error: rec.error,
          schemaVersion: rec.schemaVersion,
          agentVersion: rec.agentVersion,
          runnerVersion: rec.runnerVersion,
          prNumber: rec.prNumber,
          ranAt: rec.ranAt,
          status: rec.status,
          findingsCount: rec.findingsCount,
          costUsd: rec.costUsd,
          githubUrl: rec.jobUrl,
          source: 'gha',
        })
        .onConflictDoNothing()
        .returning({ id: t.ciRuns.id });
      if (!ci) return false;

      const [run] = await tx
        .insert(t.agentRuns)
        .values({
          workspaceId,
          agentId: rec.agentId,
          prId: null,
          ranAt: rec.ranAt,
          provider: null,
          model: rec.model,
          durationMs: rec.durationMs,
          costUsd: rec.costUsd,
          status: rec.status === 'completed' ? 'done' : 'failed',
          error: rec.error,
          source: 'ci',
          findingsCount: rec.findingsCount,
          score: null,
          blockers: rec.blockers,
        })
        .returning({ id: t.agentRuns.id });

      await tx
        .update(t.ciRuns)
        .set({ agentRunId: run!.id })
        .where(and(eq(t.ciRuns.workspaceId, workspaceId), eq(t.ciRuns.id, ci.id)));
      return true;
    });
  }

  /** `ci_runs` LEFT JOIN `agent_runs` LEFT JOIN `agents`, newest first. */
  async listRuns(
    workspaceId: string,
    opts: { agentId?: string; limit: number },
  ): Promise<CiRunRowLike[]> {
    const where = opts.agentId
      ? and(eq(t.ciRuns.workspaceId, workspaceId), eq(t.agentRuns.agentId, opts.agentId))
      : eq(t.ciRuns.workspaceId, workspaceId);
    const rows = await this.db
      .select({
        id: t.ciRuns.id,
        installationId: t.ciRuns.ciInstallationId,
        repo: t.ciRuns.repo,
        prNumber: t.ciRuns.prNumber,
        agentId: t.agentRuns.agentId,
        agentName: t.agents.name,
        status: t.ciRuns.status,
        error: t.ciRuns.error,
        verdict: t.ciRuns.verdict,
        findingsCount: t.ciRuns.findingsCount,
        costUsd: t.ciRuns.costUsd,
        durationMs: t.agentRuns.durationMs,
        jobUrl: t.ciRuns.githubUrl,
        ranAt: t.ciRuns.ranAt,
      })
      .from(t.ciRuns)
      .leftJoin(t.agentRuns, eq(t.ciRuns.agentRunId, t.agentRuns.id))
      .leftJoin(t.agents, eq(t.agentRuns.agentId, t.agents.id))
      .where(where)
      .orderBy(desc(t.ciRuns.ranAt))
      .limit(opts.limit);
    return rows;
  }
}

function toInstallation(row: InstallationRow, agentName: string | null): InstallationWithAgent {
  return {
    id: row.id,
    agentId: row.agentId,
    agentName,
    agentSlug: row.agentSlug,
    repo: row.repo,
    githubRepoId: row.githubRepoId,
    targetType: row.targetType,
    agentVersion: row.agentVersion,
    prUrl: row.prUrl,
    installedAt: row.installedAt,
    updatedAt: row.updatedAt,
  };
}
