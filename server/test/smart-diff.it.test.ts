/**
 * GET /pulls/:id/smart-diff (L03, DB-backed). Written per
 * `server/specs/L03-smart-diff.api.md`'s "Tests" section — NOT run by this
 * unit, needs Docker (testcontainers Postgres); main thread only
 * (`server/AGENTS.md`'s `*.it.test.ts` vs. hermetic split).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function makeRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `smart-diff-repo-${repoSeq++}`;
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
      title: 'Smart Diff happy path',
      author: 'marisa.koch',
      branch: 'feat/smart-diff',
      base: 'main',
      headSha: 'sha-smart-diff-1',
      additions: 0,
      deletions: 0,
      filesCount: 0,
      status: 'needs_review',
    })
    .returning();
  return { repo: repo!, pr: pr! };
}

d('GET /pulls/:id/smart-diff (DB-backed)', () => {
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

  async function makeApp() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  it('groups files into the 5 fixed roles, attaches finding_lines from the review, and sums total_lines', async () => {
    const { pr } = await makeRepoAndPr(pg.handle.db, workspaceId);

    await pg.handle.db.insert(t.prFiles).values([
      { prId: pr.id, path: 'server/src/modules/smart-diff/service.ts', additions: 40, deletions: 5 },
      { prId: pr.id, path: 'server/test/smart-diff-classify.test.ts', additions: 60, deletions: 0 },
      { prId: pr.id, path: 'server/src/modules/index.ts', additions: 2, deletions: 0 },
      { prId: pr.id, path: 'README.md', additions: 3, deletions: 1 },
      { prId: pr.id, path: 'server/pnpm-lock.yaml', additions: 10, deletions: 2 },
    ]);

    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr.id,
        kind: 'review',
        verdict: 'comment',
        summary: 'Looks reasonable.',
        score: 90,
        model: 'seed',
      })
      .returning();

    await pg.handle.db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'server/src/modules/smart-diff/service.ts',
        startLine: 20,
        endLine: 20,
        severity: 'WARNING',
        category: 'correctness',
        title: 'Consider caching',
        rationale: 'x',
        confidence: 0.8,
      },
      {
        reviewId: review!.id,
        file: 'server/src/modules/smart-diff/service.ts',
        startLine: 5,
        endLine: 5,
        severity: 'SUGGESTION',
        category: 'style',
        title: 'Rename variable',
        rationale: 'x',
        confidence: 0.6,
      },
      // Duplicate start_line — must be de-duped in the response.
      {
        reviewId: review!.id,
        file: 'server/src/modules/smart-diff/service.ts',
        startLine: 20,
        endLine: 20,
        severity: 'CRITICAL',
        category: 'correctness',
        title: 'Second finding, same line',
        rationale: 'x',
        confidence: 0.9,
      },
    ]);

    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.groups.map((g: { role: string }) => g.role)).toEqual([
      'core',
      'tests',
      'wiring',
      'docs',
      'boilerplate',
    ]);

    const coreGroup = body.groups.find((g: { role: string }) => g.role === 'core');
    const coreFile = coreGroup.files.find(
      (f: { path: string }) => f.path === 'server/src/modules/smart-diff/service.ts',
    );
    // De-duped, sorted ascending.
    expect(coreFile.finding_lines).toEqual([5, 20]);
    expect(coreFile.pseudocode_summary).toBeNull();

    const testsGroup = body.groups.find((g: { role: string }) => g.role === 'tests');
    expect(testsGroup.files.map((f: { path: string }) => f.path)).toEqual([
      'server/test/smart-diff-classify.test.ts',
    ]);

    const wiringGroup = body.groups.find((g: { role: string }) => g.role === 'wiring');
    expect(wiringGroup.files.map((f: { path: string }) => f.path)).toEqual(['server/src/modules/index.ts']);

    const docsGroup = body.groups.find((g: { role: string }) => g.role === 'docs');
    expect(docsGroup.files.map((f: { path: string }) => f.path)).toEqual(['README.md']);

    const boilerplateGroup = body.groups.find((g: { role: string }) => g.role === 'boilerplate');
    expect(boilerplateGroup.files.map((f: { path: string }) => f.path)).toEqual(['server/pnpm-lock.yaml']);

    // 40+5 + 60+0 + 2+0 + 3+1 + 10+2 = 123
    expect(body.split_suggestion).toEqual({ too_big: false, total_lines: 123, proposed_splits: [] });

    await app.close();
  });

  it('aggregates finding_lines across EVERY review, not just the most recently created one ("Run all enabled agents" creates one review per agent)', async () => {
    const { pr } = await makeRepoAndPr(pg.handle.db, workspaceId);

    await pg.handle.db.insert(t.prFiles).values({
      prId: pr.id,
      path: 'server/src/modules/smart-diff/service.ts',
      additions: 10,
      deletions: 0,
    });

    // Two reviews for the SAME PR version, as "Run all enabled agents"
    // produces — one per agent. The earlier-inserted row found something;
    // the later one (the "latest" by created_at) approved with 0 findings.
    // Restricting to reviewsForPull(prId)[0] would silently drop the first
    // agent's finding.
    const [earlierReview] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr.id, kind: 'review', verdict: 'comment', model: 'seed' })
      .returning();
    await pg.handle.db.insert(t.findings).values({
      reviewId: earlierReview!.id,
      file: 'server/src/modules/smart-diff/service.ts',
      startLine: 7,
      endLine: 7,
      severity: 'CRITICAL',
      category: 'correctness',
      title: 'Off-by-one',
      rationale: 'x',
      confidence: 0.9,
    });

    const [laterReview] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr.id, kind: 'review', verdict: 'approve', model: 'seed' })
      .returning();
    void laterReview; // approved, zero findings — intentionally contributes nothing

    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    const coreGroup = body.groups.find((g: { role: string }) => g.role === 'core');
    const file = coreGroup.files.find(
      (f: { path: string }) => f.path === 'server/src/modules/smart-diff/service.ts',
    );
    expect(file.finding_lines).toEqual([7]);

    await app.close();
  });

  it('a PR with files but no review yet returns empty finding_lines everywhere', async () => {
    const { pr } = await makeRepoAndPr(pg.handle.db, workspaceId);
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr.id,
      path: 'server/src/modules/smart-diff/helpers.ts',
      additions: 12,
      deletions: 0,
    });

    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const coreGroup = body.groups.find((g: { role: string }) => g.role === 'core');
    expect(coreGroup.files[0].finding_lines).toEqual([]);

    await app.close();
  });

  it('a PR that never fetched files returns five empty groups and total_lines: 0 (D8)', async () => {
    const { pr } = await makeRepoAndPr(pg.handle.db, workspaceId);

    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.groups).toHaveLength(5);
    expect(body.groups.every((g: { files: unknown[] }) => g.files.length === 0)).toBe(true);
    expect(body.split_suggestion).toEqual({ too_big: false, total_lines: 0, proposed_splits: [] });

    await app.close();
  });

  it('a PR in another workspace 404s', async () => {
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'Other workspace' }).returning();
    const { pr } = await makeRepoAndPr(pg.handle.db, otherWs!.id);

    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(404);

    await app.close();
  });
});
