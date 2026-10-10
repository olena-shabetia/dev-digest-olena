import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { reapStaleRunningRuns } from '../src/modules/reviews/repository/run.repo.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[reviews-reap] Docker not available — skipping integration tests.');
}

const MIN = 60 * 1000;

/**
 * The stale-run reaper. On boot it must fail EVERY 'running' row (the previous
 * process is dead). The 5-minute sweep runs inside the live process and must
 * fail only rows older than the cutoff — failing by status alone killed healthy
 * runs that were merely waiting behind earlier agents in the same Run Review.
 */
d('reapStaleRunningRuns', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function insertRun(status: string, ageMs: number): Promise<string> {
    const [row] = await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId, status, ranAt: new Date(Date.now() - ageMs) })
      .returning({ id: t.agentRuns.id });
    return row!.id;
  }

  async function read(id: string) {
    const [row] = await pg.handle.db
      .select({ status: t.agentRuns.status, error: t.agentRuns.error })
      .from(t.agentRuns)
      .where(eq(t.agentRuns.id, id));
    return row!;
  }

  it('with an age cutoff fails only old running rows, records the reason, and spares young and finished ones', async () => {
    const old = await insertRun('running', 45 * MIN);
    const young = await insertRun('running', 1 * MIN);
    const doneOld = await insertRun('done', 45 * MIN);

    const reaped = await reapStaleRunningRuns(pg.handle.db, {
      olderThanMs: 30 * MIN,
      reason: 'timed out',
    });

    expect(reaped).toBe(1);
    expect(await read(old)).toEqual({ status: 'failed', error: 'timed out' });
    expect(await read(young)).toEqual({ status: 'running', error: null });
    expect(await read(doneOld)).toEqual({ status: 'done', error: null });
  });

  it('with no options (boot) fails every running row, including young ones', async () => {
    const young = await insertRun('running', 1 * MIN);
    const older = await insertRun('running', 10 * MIN);

    const reaped = await reapStaleRunningRuns(pg.handle.db, { reason: 'restarted' });

    expect(reaped).toBeGreaterThanOrEqual(2);
    expect(await read(young)).toEqual({ status: 'failed', error: 'restarted' });
    expect(await read(older)).toEqual({ status: 'failed', error: 'restarted' });
  });

  it('leaves the error empty when no reason is given', async () => {
    const id = await insertRun('running', 1 * MIN);
    await reapStaleRunningRuns(pg.handle.db);
    expect(await read(id)).toEqual({ status: 'failed', error: null });
  });
});
