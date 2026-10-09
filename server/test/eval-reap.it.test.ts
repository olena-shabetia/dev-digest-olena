import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { EvalRepository } from '../src/modules/eval/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[eval-reap] Docker not available — skipping integration tests.');
}

const MIN = 60 * 1000;

/**
 * Stale eval set-run reaper. At boot it fails EVERY running row (their process
 * is gone). The scheduled sweep runs inside the live process and must fail only
 * rows older than the cutoff — a young running row is a healthy run.
 * (One running run per agent is enforced by a partial unique index, so each
 * running row below belongs to a different seeded agent.)
 */
d('EvalRepository.reapRunningRuns', () => {
  let pg: PgFixture;
  let repo: EvalRepository;
  let workspaceId: string;
  let agentIds: string[];

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    repo = new EvalRepository(pg.handle.db);
    const agents = await pg.handle.db.select({ id: t.agents.id }).from(t.agents);
    agentIds = agents.map((a) => a.id);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function insertRun(agentId: string, status: string, ageMs: number, casesTotal = 1): Promise<string> {
    const [row] = await pg.handle.db
      .insert(t.evalSetRuns)
      .values({
        workspaceId,
        agentId,
        status,
        agentVersion: 1,
        provider: 'openrouter',
        model: 'test-model',
        strategy: 'single-pass',
        systemPrompt: 'p',
        casesTotal,
        startedAt: new Date(Date.now() - ageMs),
      })
      .returning({ id: t.evalSetRuns.id });
    return row!.id;
  }

  async function read(id: string) {
    const [row] = await pg.handle.db
      .select({ status: t.evalSetRuns.status, error: t.evalSetRuns.error, finishedAt: t.evalSetRuns.finishedAt })
      .from(t.evalSetRuns)
      .where(eq(t.evalSetRuns.id, id));
    return row!;
  }

  it('with a cutoff fails only old running runs and records why', async () => {
    const old = await insertRun(agentIds[0]!, 'running', 45 * MIN);
    const young = await insertRun(agentIds[1]!, 'running', 1 * MIN);
    const done = await insertRun(agentIds[2]!, 'completed', 45 * MIN);

    const reaped = await repo.reapRunningRuns('timed out', 30 * MIN);

    expect(reaped).toBe(1);
    const o = await read(old);
    expect(o.status).toBe('failed');
    expect(o.error).toBe('timed out');
    expect(o.finishedAt).not.toBeNull();
    expect((await read(young)).status).toBe('running');
    expect((await read(done)).status).toBe('completed');
  });

  it('without a cutoff (boot) fails every running run', async () => {
    const reaped = await repo.reapRunningRuns('restarted');
    expect(reaped).toBeGreaterThanOrEqual(1);
    const rows = await pg.handle.db
      .select({ status: t.evalSetRuns.status })
      .from(t.evalSetRuns)
      .where(eq(t.evalSetRuns.status, 'running'));
    expect(rows).toHaveLength(0);
  });

  it('scales the cutoff with the run size (cases_total x perCaseMs)', async () => {
    await repo.reapRunningRuns('cleanup'); // start from no running rows
    // Both started 20 min ago; cutoff = 10 min slack + cases_total x 2 min.
    const big = await insertRun(agentIds[3]!, 'running', 20 * MIN, 15); // cutoff 40 min -> spared
    const small = await insertRun(agentIds[4]!, 'running', 20 * MIN, 1); // cutoff 12 min -> reaped

    const reaped = await repo.reapRunningRuns('too slow', 10 * MIN, 2 * MIN);

    expect(reaped).toBe(1);
    expect((await read(big)).status).toBe('running');
    expect((await read(small)).status).toBe('failed');
  });

  it('does not let a swept run be revived by its still-running executor', async () => {
    const id = await insertRun(agentIds[0]!, 'failed', 5 * MIN);
    await repo.finishRun(workspaceId, id, {
      status: 'completed',
      error: null,
      results: [],
      casesDone: 1,
      casesPassed: 1,
      casesErrored: 0,
      recall: 1,
      precision: 1,
      citationAccuracy: 1,
      durationMs: 1,
      costUsd: 0,
    });
    await repo.recordProgress(workspaceId, id, { results: [], casesDone: 9 });
    const row = await read(id);
    expect(row.status).toBe('failed');
  });
});
