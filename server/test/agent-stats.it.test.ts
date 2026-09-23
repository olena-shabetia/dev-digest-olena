import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[agent-stats] Docker not available — skipping integration tests.');
}

/**
 * `GET /agents/:id/stats` and `GET /agents/:id/runs` (L02, completing the
 * `AgentStats` contract stub, `contracts/observability.ts:96`).
 *
 * Covers the load-bearing split documented on `AgentsRepository.agentStats`:
 * `runs` / `total_cost_usd` / `avg_cost_usd` / `avg_latency_ms` / `trend` are
 * windowed to the last 30 days of `agent_runs`, while every findings-derived
 * field is all-time and unaffected by that window.
 */
d('GET /agents/:id/stats and /agents/:id/runs', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  /** Seed one agent, 4 agent_runs (3 within 30d, 1 well outside), 2 reviews,
   *  and 4 findings across two severities/categories with a mix of
   *  accepted/dismissed/pending outcomes. Returns everything a test needs to
   *  compute the expected numbers by hand. */
  async function seedStatsFixture() {
    const { db } = pg.handle;
    const app = await makeApp();

    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Stats Agent ${Date.now()}`,
        provider: 'openai' as const,
        model: 'gpt-4o-mini',
        system_prompt: 'Review the diff.',
      },
    });
    expect(created.statusCode).toBe(201);
    const agentId = created.json().id as string;

    const [{ id: workspaceId }] = await db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));

    const [pr] = await db
      .select({ id: t.pullRequests.id, number: t.pullRequests.number })
      .from(t.pullRequests)
      .where(eq(t.pullRequests.workspaceId, workspaceId!))
      .limit(1);
    const prId = pr!.id;
    const prNumber = pr!.number;

    const now = Date.now();
    const daysAgo = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000);

    // 3 runs inside the 30-day window, 1 well outside it (40 days ago).
    const runSpecs = [
      { ranAt: daysAgo(1), durationMs: 100, costUsd: 1 },
      { ranAt: daysAgo(5), durationMs: 200, costUsd: 2 },
      { ranAt: daysAgo(10), durationMs: 300, costUsd: 3 },
      { ranAt: daysAgo(40), durationMs: 999, costUsd: 999 },
    ];
    const runRows = await Promise.all(
      runSpecs.map((spec) =>
        db
          .insert(t.agentRuns)
          .values({
            workspaceId: workspaceId!,
            agentId,
            prId,
            ranAt: spec.ranAt,
            provider: 'openai',
            model: 'gpt-4o-mini',
            durationMs: spec.durationMs,
            costUsd: spec.costUsd,
            status: 'done',
          })
          .returning(),
      ),
    );

    // 2 reviews for this agent, all-time (not windowed).
    const [review1] = await db
      .insert(t.reviews)
      .values({
        workspaceId: workspaceId!,
        prId,
        agentId,
        kind: 'review',
        verdict: 'comment',
      })
      .returning();
    const [review2] = await db
      .insert(t.reviews)
      .values({
        workspaceId: workspaceId!,
        prId,
        agentId,
        kind: 'review',
        verdict: 'comment',
      })
      .returning();

    const baseFinding = {
      file: 'src/x.ts',
      startLine: 1,
      endLine: 1,
      title: 'x',
      rationale: 'x',
      confidence: 0.9,
    };
    await db.insert(t.findings).values([
      {
        ...baseFinding,
        reviewId: review1!.id,
        severity: 'CRITICAL',
        category: 'security',
        acceptedAt: new Date(),
      },
      {
        ...baseFinding,
        reviewId: review1!.id,
        severity: 'WARNING',
        category: 'security',
        dismissedAt: new Date(),
      },
      {
        ...baseFinding,
        reviewId: review2!.id,
        severity: 'WARNING',
        category: 'perf',
      },
      {
        ...baseFinding,
        reviewId: review2!.id,
        severity: 'SUGGESTION',
        category: 'perf',
        acceptedAt: new Date(),
      },
    ]);

    return { app, agentId, prNumber, runRows: runRows.map(([r]) => r!) };
  }

  it('computes windowed run/cost/latency/trend fields and all-time findings fields exactly', async () => {
    const { app, agentId } = await seedStatsFixture();

    const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/stats` });
    expect(res.statusCode).toBe(200);
    const stats = res.json();

    // ---- 30-day-windowed fields: only the 3 in-window runs count ----------
    expect(stats.agent_id).toBe(agentId);
    expect(typeof stats.agent_name).toBe('string');
    expect(stats.runs).toBe(3);
    expect(stats.total_cost_usd).toBe(6);
    expect(stats.avg_cost_usd).toBe(2);
    expect(stats.avg_latency_ms).toBe(200);
    expect(Array.isArray(stats.trend)).toBe(true);
    expect(stats.trend).toHaveLength(30);
    const trendTotal = stats.trend.reduce(
      (sum: number, p: { value: number }) => sum + p.value,
      0,
    );
    // Only the 3 in-window runs land inside the 30-day trend; the 40-day-old
    // run must NOT be counted, even though the trend spans exactly 30 days.
    expect(trendTotal).toBe(3);
    for (const point of stats.trend) {
      expect(typeof point.label).toBe('string');
      expect(point.label).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }

    // ---- all-time findings fields: unaffected by the 30-day run window ----
    expect(stats.findings_total).toBe(4);
    expect(stats.accepted).toBe(2);
    expect(stats.dismissed).toBe(1);
    expect(stats.pending).toBe(1);
    expect(stats.accept_rate).toBeCloseTo(2 / 3);
    expect(stats.dismiss_rate).toBeCloseTo(1 / 3);
    // avg_findings_per_run divides the all-time findings_total (4) by the
    // 30-day runs count (3) — a deliberate mixed-window ratio per spec.
    expect(stats.avg_findings_per_run).toBeCloseTo(4 / 3);
    expect(stats.findings_by_severity).toEqual({ CRITICAL: 1, WARNING: 2, SUGGESTION: 1 });
    expect(stats.findings_by_category).toEqual({ security: 2, perf: 2 });

    await app.close();
  });

  it('GET /agents/:id/runs?limit=2 returns exactly 2 rows, newest-first, with pr_number populated', async () => {
    const { app, agentId, prNumber } = await seedStatsFixture();

    const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/runs?limit=2` });
    expect(res.statusCode).toBe(200);
    const runs = res.json();
    expect(runs).toHaveLength(2);
    // Newest-first: the 1-day-old run, then the 5-day-old run (the 10- and
    // 40-day-old runs are older still and fall outside the limit=2 cutoff).
    expect(runs[0].pr_number).toBe(prNumber);
    expect(runs[1].pr_number).toBe(prNumber);
    const ranAts = runs.map((r: { ran_at: string }) => new Date(r.ran_at).getTime());
    expect(ranAts[0]).toBeGreaterThan(ranAts[1]);

    await app.close();
  });

  it('404s GET /agents/:id/stats and /agents/:id/runs for an unknown agent', async () => {
    const app = await makeApp();
    const ghost = '00000000-0000-0000-0000-000000000000';
    expect(
      (await app.inject({ method: 'GET', url: `/agents/${ghost}/stats` })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/agents/${ghost}/runs` })).statusCode,
    ).toBe(404);
    await app.close();
  });
});
