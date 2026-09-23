/**
 * GET /repos/:id/pulls — PrMeta.findings (L02, findings-by-severity).
 * Per-severity rollup of the PR's LATEST review, computed on read in
 * `reviewAggregatesByPr` (src/modules/pulls/repository.ts). See
 * specs/L02-findings-by-severity.md for the null-vs-zero contract this
 * mirrors from the L01 cost_usd column.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[integration] Docker not available — skipping pulls-findings integration tests.');
}

d('GET /repos/:id/pulls — findings rollup', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function listPulls(repoId: string) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
    await app.close();
    return res.json() as Array<{ number: number; findings: unknown }>;
  }

  it('PR #482 rolls up its 3 seeded findings (1 critical, 1 warning, 1 suggestion)', async () => {
    const { workspaceId } = await seed(pg.handle.db);
    void workspaceId;
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.fullName, 'acme/payments-api'));

    const pulls = await listPulls(repo!.id);
    const pr482 = pulls.find((p) => p.number === 482)!;
    expect(pr482.findings).toMatchObject({
      critical: 1,
      warning: 1,
      suggestion: 1,
      total: 3,
    });
    const findings = pr482.findings as { preview: Array<{ severity: string }> };
    // No cap — the popover scrolls instead of truncating with "+N more".
    expect(findings.preview.length).toBe(3);
    expect(findings.preview[0]!.severity).toBe('CRITICAL');
  });

  it('a PR with no review has findings === null, never all-zeros', async () => {
    const { workspaceId } = await seed(pg.handle.db);
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.fullName, 'acme/payments-api'));
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 998,
        title: 'No review yet',
        author: 'nobody',
        branch: 'x',
        base: 'main',
        headSha: 'deadbeef',
        additions: 0,
        deletions: 0,
        filesCount: 0,
        status: 'needs_review',
      })
      .returning();

    const pulls = await listPulls(repo!.id);
    const pr998 = pulls.find((p) => p.number === pr!.number)!;
    expect(pr998.findings).toBeNull();
  });

  it('a review with zero findings rolls up to all zeros — distinct from never-reviewed', async () => {
    const { workspaceId } = await seed(pg.handle.db);
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.fullName, 'acme/payments-api'));
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 997,
        title: 'Clean PR',
        author: 'nobody',
        branch: 'y',
        base: 'main',
        headSha: 'cafebabe',
        additions: 3,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    await pg.handle.db.insert(t.reviews).values({
      workspaceId,
      prId: pr!.id,
      kind: 'review',
      verdict: 'approve',
      summary: 'Looks good.',
      score: 100,
      model: 'seed',
    });

    const pulls = await listPulls(repo!.id);
    const pr997 = pulls.find((p) => p.number === pr!.number)!;
    expect(pr997.findings).toEqual({ critical: 0, warning: 0, suggestion: 0, total: 0, preview: [] });
  });

  it('only the latest review is rolled up, not older ones', async () => {
    const { workspaceId } = await seed(pg.handle.db);
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.fullName, 'acme/payments-api'));
    const [pr] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repo!.id), eq(t.pullRequests.number, 482)));

    // Insert a NEWER review with a single SUGGESTION finding.
    const [newerReview] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'comment',
        summary: 'Follow-up pass.',
        score: 88,
        model: 'seed',
      })
      .returning();
    await pg.handle.db.insert(t.findings).values({
      reviewId: newerReview!.id,
      file: 'src/api/public/webhooks.ts',
      startLine: 5,
      endLine: 5,
      severity: 'SUGGESTION',
      category: 'style',
      title: 'Prefer const over let',
      rationale: 'Never reassigned.',
      confidence: 0.7,
    });

    const pulls = await listPulls(repo!.id);
    const pr482 = pulls.find((p) => p.number === 482)!;
    expect(pr482.findings).toMatchObject({ critical: 0, warning: 0, suggestion: 1, total: 1 });
  });
});
