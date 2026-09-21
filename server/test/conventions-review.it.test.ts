import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { makeRepoIntelStub } from './helpers/repo-intel-stub.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * DB-backed coverage for the review lifecycle: GET (list/empty-state), PATCH
 * (status/rule/category + the `edited` flag rule), and workspace isolation.
 * Integration tests call `seed()` rather than hand-rolling a workspace row
 * (server/INSIGHTS.md).
 */
d('conventions review lifecycle (DB-backed)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient(), repoIntel: makeRepoIntelStub() },
    });
  }

  async function otherWorkspaceId(): Promise<string> {
    const [ws] = await pg.handle.db.insert(t.workspaces).values({ name: 'Other workspace' }).returning();
    return ws!.id;
  }

  async function makeRepo(ws: string, name: string) {
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    return repo!;
  }

  async function insertCandidate(ws: string, repoId: string, overrides: Partial<typeof t.conventions.$inferInsert> = {}) {
    const [row] = await pg.handle.db
      .insert(t.conventions)
      .values({
        workspaceId: ws,
        repoId,
        category: 'naming',
        rule: 'Use camelCase',
        evidencePath: 'src/a.ts',
        evidenceLine: 1,
        evidenceSnippet: 'const a = 1;',
        evidenceSha: 'sha1',
        evidences: [{ path: 'src/a.ts', line: 1, snippet: 'const a = 1;', sha: 'sha1' }],
        confidence: 0.7,
        status: 'pending',
        ...overrides,
      })
      .returning();
    return row!;
  }

  it('GET before any scan returns an empty, well-shaped result', async () => {
    const app = await makeApp();
    const repo = await makeRepo(workspaceId, 'empty-review');

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ scan: null, candidates: [] });

    await app.close();
  });

  it('GET lists candidates scoped to the repo, with derived evidence_url', async () => {
    const app = await makeApp();
    const repo = await makeRepo(workspaceId, 'listed');
    await insertCandidate(workspaceId, repo.id);

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0].evidence_url).toBe(`https://github.com/acme/listed/blob/sha1/src/a.ts#L1`);

    await app.close();
  });

  it('a repo from another workspace 404s', async () => {
    const app = await makeApp();
    const otherWs = await otherWorkspaceId();
    const repo = await makeRepo(otherWs, 'foreign');

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('PATCH status only does not set edited', async () => {
    const app = await makeApp();
    const repo = await makeRepo(workspaceId, 'patch-status');
    const candidate = await insertCandidate(workspaceId, repo.id);

    const res = await app.inject({
      method: 'PATCH',
      url: `/conventions/${candidate.id}`,
      payload: { status: 'accepted' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('accepted');
    expect(body.edited).toBe(false);

    await app.close();
  });

  it('PATCH rule/category sets edited: true and the decision survives a reload', async () => {
    const app = await makeApp();
    const repo = await makeRepo(workspaceId, 'patch-edit');
    const candidate = await insertCandidate(workspaceId, repo.id);

    const res = await app.inject({
      method: 'PATCH',
      url: `/conventions/${candidate.id}`,
      payload: { rule: 'Tightened wording', category: 'typing' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rule).toBe('Tightened wording');
    expect(body.category).toBe('typing');
    expect(body.edited).toBe(true);

    const reload = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` })).json();
    expect(reload.candidates[0].rule).toBe('Tightened wording');
    expect(reload.candidates[0].edited).toBe(true);

    await app.close();
  });

  it('PATCH on a candidate from another workspace 404s', async () => {
    const app = await makeApp();
    const otherWs = await otherWorkspaceId();
    const otherRepo = await makeRepo(otherWs, 'foreign-patch');
    const candidate = await insertCandidate(otherWs, otherRepo.id);

    const res = await app.inject({
      method: 'PATCH',
      url: `/conventions/${candidate.id}`,
      payload: { status: 'rejected' },
    });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('PATCH on an unknown id 404s', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'PATCH',
      url: `/conventions/00000000-0000-0000-0000-000000000000`,
      payload: { status: 'rejected' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
