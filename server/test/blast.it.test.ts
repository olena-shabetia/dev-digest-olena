/**
 * GET /pulls/:id/blast (L04, DB-backed). Written per
 * `server/specs/L04-blast-radius.api.md`'s "Tests" section — NOT run by this
 * unit, needs Docker (testcontainers Postgres); main thread only
 * (`server/AGENTS.md`'s `*.it.test.ts` vs. hermetic split).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import type { RepoIntel, BlastResult } from '../src/modules/repo-intel/types.js';
import { toBlastRadiusResponse } from '../src/modules/blast/helpers.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** Inline degraded no-op stub — only `getBlastRadius` is overridden per test. */
function makeInlineRepoIntelStub(getBlastRadius: RepoIntel['getBlastRadius']): RepoIntel {
  return {
    indexRepo: async () => ({ status: 'degraded', filesIndexed: 0, filesSkipped: 0, durationMs: 0 }),
    refreshIndex: async () => ({ status: 'degraded', filesIndexed: 0, filesSkipped: 0, durationMs: 0 }),
    getIndexState: async (repoId: string) => ({
      repoId,
      status: 'degraded',
      filesIndexed: 0,
      filesSkipped: 0,
      durationMs: 0,
      lastIndexedSha: '',
      indexerVersion: 1,
      updatedAt: new Date(0),
      degraded: true,
    }),
    getBlastRadius,
    getRepoMap: async () => ({ text: '', tokens: 0, cached: false, degraded: true }),
    getFileRank: async () => [],
    getSymbolsInFiles: async () => [],
    getCallerSignatures: async () => [],
    getUnresolvedReferences: async () => [],
    getConventionSamples: async () => [],
    getTopFilesByRank: async () => [],
    getCriticalPaths: async () => [],
  };
}

const fixedPersistentResult: BlastResult = {
  changedSymbols: [{ file: 'src/a.ts', name: 'foo', kind: 'function' }],
  callers: [{ file: 'src/routes/x.ts', symbol: 'handlerX', viaSymbol: 'foo', line: 10, rank: 5 }],
  impactedEndpoints: ['GET /x'],
  factsByFile: { 'src/routes/x.ts': { endpoints: ['GET /x'], crons: [] } },
  degraded: false,
};

let repoSeq = 0;
async function makeRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `blast-repo-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 1,
      title: 'Blast radius happy path',
      author: 'marisa.koch',
      branch: 'feat/blast',
      base: 'main',
      headSha: 'sha-blast-1',
      additions: 0,
      deletions: 0,
      filesCount: 0,
      status: 'needs_review',
    })
    .returning();
  return { repo: repo!, pr: pr! };
}

d('GET /pulls/:id/blast (DB-backed)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    const seeded = await seed(pg.handle.db);
    workspaceId = seeded.workspaceId;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function makeApp(getBlastRadius: RepoIntel['getBlastRadius']) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        repoIntel: makeInlineRepoIntelStub(getBlastRadius),
      },
    });
  }

  it('200s with a body deep-equal to the helper output for a fixed persistent-shaped BlastResult', async () => {
    const { pr } = await makeRepoAndPr(pg.handle.db, workspaceId);
    await pg.handle.db.insert(t.prFiles).values({ prId: pr.id, path: 'src/a.ts', additions: 1, deletions: 0 });

    const app = await makeApp(async () => fixedPersistentResult);
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(toBlastRadiusResponse(fixedPersistentResult));

    await app.close();
  });

  it('unknown uuid 404s', async () => {
    const app = await makeApp(async () => fixedPersistentResult);
    const res = await app.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-0000-0000-000000000000/blast',
    });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('non-uuid id 422s', async () => {
    const app = await makeApp(async () => fixedPersistentResult);
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/blast' });
    expect(res.statusCode).toBe(422);

    await app.close();
  });
});
