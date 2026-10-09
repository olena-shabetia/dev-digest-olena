import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { ValidationError } from '../../platform/errors.js';
import type {
  EvalCasePrMeta,
  EvalExpectation,
  EvalRunCaseRef,
  EvalSetRunCaseResult,
  EvalSkillSnapshot,
} from '@devdigest/shared';
import {
  StoredCaseRefs,
  StoredExpectedOutput,
  StoredPrMeta,
  StoredResults,
  StoredSkills,
  type StoredEvalCase,
  type StoredEvalSetRun,
} from './types.js';

type CaseRow = typeof t.evalCases.$inferSelect;
type SetRunRow = typeof t.evalSetRuns.$inferSelect;

function parseStored<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } }, value: unknown, what: string): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new ValidationError(`Stored eval data is malformed: ${what}`);
  return r.data;
}

function toCase(row: CaseRow): StoredEvalCase {
  const [expectation] = parseStored(StoredExpectedOutput, row.expectedOutput, 'expected_output');
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    agentId: row.ownerId,
    sourceFindingId: row.sourceFindingId,
    name: row.name,
    inputDiff: row.inputDiff ?? '',
    pr: parseStored(StoredPrMeta, row.inputMeta, 'input_meta'),
    expectation: expectation as EvalExpectation,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRun(row: SetRunRow): StoredEvalSetRun {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    agentId: row.agentId,
    status: row.status,
    error: row.error,
    agentVersion: row.agentVersion,
    provider: row.provider,
    model: row.model,
    strategy: row.strategy,
    systemPrompt: row.systemPrompt,
    skills: parseStored(StoredSkills, row.skills, 'skills'),
    cases: parseStored(StoredCaseRefs, row.cases, 'cases'),
    results: parseStored(StoredResults, row.results, 'results'),
    casesTotal: row.casesTotal,
    casesDone: row.casesDone,
    casesPassed: row.casesPassed,
    casesErrored: row.casesErrored,
    recall: row.recall,
    precision: row.precision,
    citationAccuracy: row.citationAccuracy,
    durationMs: row.durationMs,
    costUsd: row.costUsd,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

/**
 * Eval data access. Owns `eval_cases` (owner_kind='agent') and `eval_set_runs`.
 * Never reads or writes the legacy `eval_runs` table (one row per case run).
 */
export class EvalRepository {
  constructor(private readonly db: Db) {}

  private caseScope(workspaceId: string) {
    return and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerKind, 'agent'));
  }

  // ---- cases ---------------------------------------------------------------

  /** Returns null when the (agent, finding) unique index already holds a case. */
  async insertCase(v: {
    workspaceId: string;
    agentId: string;
    sourceFindingId: string;
    name: string;
    inputDiff: string;
    pr: EvalCasePrMeta;
    expectation: EvalExpectation;
  }): Promise<StoredEvalCase | null> {
    const rows = await this.db
      .insert(t.evalCases)
      .values({
        workspaceId: v.workspaceId,
        ownerKind: 'agent',
        ownerId: v.agentId,
        sourceFindingId: v.sourceFindingId,
        name: v.name,
        inputDiff: v.inputDiff,
        inputMeta: v.pr,
        expectedOutput: [v.expectation],
      })
      .onConflictDoNothing({ target: [t.evalCases.ownerId, t.evalCases.sourceFindingId] })
      .returning();
    return rows[0] ? toCase(rows[0]) : null;
  }

  async findCaseByFinding(
    workspaceId: string,
    agentId: string,
    findingId: string,
  ): Promise<StoredEvalCase | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          this.caseScope(workspaceId),
          eq(t.evalCases.ownerId, agentId),
          eq(t.evalCases.sourceFindingId, findingId),
        ),
      )
      .limit(1);
    return row ? toCase(row) : undefined;
  }

  async getCase(workspaceId: string, id: string): Promise<StoredEvalCase | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(this.caseScope(workspaceId), eq(t.evalCases.id, id)))
      .limit(1);
    return row ? toCase(row) : undefined;
  }

  async listCases(workspaceId: string, agentId: string): Promise<StoredEvalCase[]> {
    const rows = await this.db
      .select()
      .from(t.evalCases)
      .where(and(this.caseScope(workspaceId), eq(t.evalCases.ownerId, agentId)))
      .orderBy(t.evalCases.createdAt, t.evalCases.id);
    return rows.map(toCase);
  }

  async countCasesByAgent(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ agentId: t.evalCases.ownerId, n: count() })
      .from(t.evalCases)
      .where(this.caseScope(workspaceId))
      .groupBy(t.evalCases.ownerId);
    return new Map(rows.map((r) => [r.agentId, Number(r.n)]));
  }

  async updateCase(
    workspaceId: string,
    id: string,
    v: { name: string; inputDiff: string; expectation: EvalExpectation },
  ): Promise<StoredEvalCase | undefined> {
    const [row] = await this.db
      .update(t.evalCases)
      .set({
        name: v.name,
        inputDiff: v.inputDiff,
        expectedOutput: [v.expectation],
        updatedAt: new Date(),
      })
      .where(and(this.caseScope(workspaceId), eq(t.evalCases.id, id)))
      .returning();
    return row ? toCase(row) : undefined;
  }

  async deleteCase(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(this.caseScope(workspaceId), eq(t.evalCases.id, id)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  // ---- set runs ------------------------------------------------------------

  /** Returns null when the one-running-per-agent partial unique index conflicts. */
  async insertRunningRun(v: {
    workspaceId: string;
    agentId: string;
    agentVersion: number;
    provider: string;
    model: string;
    strategy: string;
    systemPrompt: string;
    skills: EvalSkillSnapshot[];
    cases: EvalRunCaseRef[];
    casesTotal: number;
  }): Promise<StoredEvalSetRun | null> {
    const rows = await this.db
      .insert(t.evalSetRuns)
      .values({ ...v, status: 'running' })
      .onConflictDoNothing()
      .returning();
    return rows[0] ? toRun(rows[0]) : null;
  }

  async findRunningRun(workspaceId: string, agentId: string): Promise<StoredEvalSetRun | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalSetRuns)
      .where(
        and(
          eq(t.evalSetRuns.workspaceId, workspaceId),
          eq(t.evalSetRuns.agentId, agentId),
          eq(t.evalSetRuns.status, 'running'),
        ),
      )
      .limit(1);
    return row ? toRun(row) : undefined;
  }

  async recordProgress(
    workspaceId: string,
    runId: string,
    v: { results: EvalSetRunCaseResult[]; casesDone: number },
  ): Promise<void> {
    await this.db
      .update(t.evalSetRuns)
      .set({ results: v.results, casesDone: v.casesDone })
      .where(
        and(
          eq(t.evalSetRuns.workspaceId, workspaceId),
          eq(t.evalSetRuns.id, runId),
          // A run the sweep already failed must not be revived by its detached executor.
          eq(t.evalSetRuns.status, 'running'),
        ),
      );
  }

  async finishRun(
    workspaceId: string,
    runId: string,
    v: {
      status: 'completed' | 'failed';
      error: string | null;
      results: EvalSetRunCaseResult[];
      casesDone: number;
      casesPassed: number | null;
      casesErrored: number | null;
      recall: number | null;
      precision: number | null;
      citationAccuracy: number | null;
      durationMs: number | null;
      costUsd: number | null;
    },
  ): Promise<void> {
    await this.db
      .update(t.evalSetRuns)
      .set({ ...v, finishedAt: new Date() })
      .where(
        and(
          eq(t.evalSetRuns.workspaceId, workspaceId),
          eq(t.evalSetRuns.id, runId),
          eq(t.evalSetRuns.status, 'running'),
        ),
      );
  }

  async getRun(workspaceId: string, id: string): Promise<StoredEvalSetRun | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalSetRuns)
      .where(and(eq(t.evalSetRuns.workspaceId, workspaceId), eq(t.evalSetRuns.id, id)))
      .limit(1);
    return row ? toRun(row) : undefined;
  }

  async listRuns(workspaceId: string, agentId: string, limit: number): Promise<StoredEvalSetRun[]> {
    const rows = await this.db
      .select()
      .from(t.evalSetRuns)
      .where(and(eq(t.evalSetRuns.workspaceId, workspaceId), eq(t.evalSetRuns.agentId, agentId)))
      .orderBy(desc(t.evalSetRuns.startedAt))
      .limit(limit);
    return rows.map(toRun);
  }

  async listRecentRuns(workspaceId: string, limit: number): Promise<StoredEvalSetRun[]> {
    const rows = await this.db
      .select()
      .from(t.evalSetRuns)
      .where(eq(t.evalSetRuns.workspaceId, workspaceId))
      .orderBy(desc(t.evalSetRuns.startedAt))
      .limit(limit);
    return rows.map(toRun);
  }

  async latestCompletedByAgent(workspaceId: string): Promise<Map<string, StoredEvalSetRun>> {
    const rows = await this.db
      .selectDistinctOn([t.evalSetRuns.agentId])
      .from(t.evalSetRuns)
      .where(and(eq(t.evalSetRuns.workspaceId, workspaceId), eq(t.evalSetRuns.status, 'completed')))
      .orderBy(t.evalSetRuns.agentId, desc(t.evalSetRuns.startedAt));
    return new Map(rows.map((r) => [r.agentId, toRun(r)]));
  }

  /**
   * Marks every `running` row failed. The one query NOT scoped by workspace_id:
   * it runs once at boot, before listening, and assumes a single API instance
   * per DB (D-14) — same stance as ReviewService.reapStaleRuns.
   */
  async reapRunningRuns(error: string, olderThanMs?: number, perCaseMs = 0): Promise<number> {
    const conditions = [eq(t.evalSetRuns.status, 'running')];
    if (olderThanMs !== undefined) {
      // A run may legitimately take cases_total x perCaseMs, so the cutoff
      // grows with the run's size: olderThanMs + cases_total * perCaseMs.
      conditions.push(
        sql`${t.evalSetRuns.startedAt} < now() - (${olderThanMs}::double precision + ${t.evalSetRuns.casesTotal} * ${perCaseMs}::double precision) * interval '1 millisecond'`,
      );
    }
    const rows = await this.db
      .update(t.evalSetRuns)
      .set({ status: 'failed', error, finishedAt: new Date() })
      .where(and(...conditions))
      .returning({ id: t.evalSetRuns.id });
    return rows.length;
  }
}
