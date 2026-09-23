import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * Wave 1.2, step A — a key-set snapshot of every route that had ZERO test
 * coverage before this session (plan: plans/moonlit-drifting-pnueli.md).
 *
 * Purpose: capture "as returned today" so that adding `response:` schemas in
 * the following steps cannot silently drop or rename a field without this
 * suite going red first. Assertions check the SHAPE (key sets), not just the
 * HTTP status — a `response:` schema that strips an undeclared key changes
 * the shape, not the status code.
 *
 * Do not tighten these assertions to "expected final shape" — they document
 * the pre-schema baseline. If a later step legitimately changes a shape
 * (e.g. repo-intel's Date → ISO string in step B), update the assertion in
 * the same commit as that step, not preemptively.
 */
d('response shapes — routes with no prior test coverage', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    // This suite fires several fire-and-forget background jobs (repos/service
    // 'clone', repo-intel 'resync') via JobRunner.enqueue (platform/jobs.ts:47)
    // — enqueue() returns as soon as the row is inserted, the handler keeps
    // running on JobRunner's internal p-queue. `pg.stop()` tears down the
    // whole Postgres container; a handler still mid-query at that moment
    // throws an unhandled CONNECTION_ENDED rejection. Drain to a terminal
    // status first so the queue is empty before the container goes away.
    await waitForJobs(pg.handle.db);
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

  async function makeRepoAndPr(app: Awaited<ReturnType<typeof makeApp>>) {
    const repo = (
      await app.inject({ method: 'POST', url: '/repos', payload: { url: 'https://github.com/acme/widgets' } })
    ).json();
    const pulls = (
      await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })
    ).json();
    return { repo, pr: pulls[0] };
  }

  it('GET /workspace → {workspaceId, cloneDir, repos[]}', async () => {
    const app = await makeApp();
    await makeRepoAndPr(app); // ensure repos[] is non-empty
    const res = await app.inject({ method: 'GET', url: '/workspace' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual(['cloneDir', 'repos', 'workspaceId']);
    expect(Array.isArray(body.repos)).toBe(true);
    expect(body.repos.length).toBeGreaterThan(0);
    expect(Object.keys(body.repos[0]).sort()).toEqual(
      ['clone_path', 'cloned', 'full_name', 'id', 'last_polled_at'].sort(),
    );
    await app.close();
  });

  it('GET /pulls/:id → PrDetail keys (GitHub client available)', async () => {
    const app = await makeApp();
    const { pr } = await makeRepoAndPr(app);
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual(
      [
        'id',
        'number',
        'title',
        'author',
        'branch',
        'base',
        'head_sha',
        'additions',
        'deletions',
        'files_count',
        'status',
        'body',
        'files',
        'commits',
        'linked_issue',
      ].sort(),
    );
    await app.close();
  });

  it('GET /pulls/:id/runs → array of RunSummary (empty when no runs)', async () => {
    const app = await makeApp();
    const { pr } = await makeRepoAndPr(app);
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
    await app.close();
  });

  it('GET /pulls/:id/runs → RunSummary keys once a run exists', async () => {
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openai: new MockLLMProvider('openai', { structured: MINIMAL_REVIEW }) },
      },
    });
    const { pr } = await makeRepoAndPr(app);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Snap', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` });
    const runs = res.json();
    expect(runs.length).toBeGreaterThan(0);
    expect(Object.keys(runs[0]).sort()).toEqual(
      [
        'run_id',
        'agent_id',
        'agent_name',
        'pr_number',
        'provider',
        'model',
        'status',
        'error',
        'duration_ms',
        'tokens_in',
        'tokens_out',
        'cost_usd',
        'findings_count',
        'grounding',
        'ran_at',
        'score',
        'blockers',
      ].sort(),
    );
    await app.close();
  });

  it('GET /pulls/:id/runs/active → array (structurally an ActiveRun[])', async () => {
    const app = await makeApp();
    const { pr } = await makeRepoAndPr(app);
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs/active` });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
    // The review pipeline runs synchronously in this test setup, so there is
    // no reliable window to observe a 'running' row — the endpoint's item
    // shape is exercised indirectly via the repository unit that builds it
    // (reviews/repository/run.repo.ts:31-36: run_id/agent_id/agent_name/ran_at).
    await app.close();
  });

  it('DELETE /runs/:id → {ok}, then 404-equivalent second delete', async () => {
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openai: new MockLLMProvider('openai', { structured: MINIMAL_REVIEW }) },
      },
    });
    const { pr } = await makeRepoAndPr(app);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'DelRun', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    const runId = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json().runs[0].run_id;

    const res = await app.inject({ method: 'DELETE', url: `/runs/${runId}` });
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json())).toEqual(['ok']);
    expect(res.json().ok).toBe(true);

    const second = await app.inject({ method: 'DELETE', url: `/runs/${runId}` });
    expect(Object.keys(second.json())).toEqual(['ok']);
    expect(second.json().ok).toBe(false);
    await app.close();
  });

  it('POST /runs/:id/cancel → {ok: true}', async () => {
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openai: new MockLLMProvider('openai', { structured: MINIMAL_REVIEW }) },
      },
    });
    const { pr } = await makeRepoAndPr(app);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'CancelRun', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    const runId = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json().runs[0].run_id;

    const res = await app.inject({ method: 'POST', url: `/runs/${runId}/cancel` });
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json())).toEqual(['ok']);
    expect(res.json().ok).toBe(true);
    await app.close();
  });

  it('DELETE /reviews/:id → {ok: true}', async () => {
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openai: new MockLLMProvider('openai', { structured: MINIMAL_REVIEW }) },
      },
    });
    const { pr } = await makeRepoAndPr(app);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'DelReview', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })).json();
    const reviewId = reviews[0].id;

    const res = await app.inject({ method: 'DELETE', url: `/reviews/${reviewId}` });
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json())).toEqual(['ok']);
    expect(res.json().ok).toBe(true);
    await app.close();
  });

  it('GET /agents/:id/skills → [] then POST sets skills, GET reflects them', async () => {
    const app = await makeApp();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'SkillAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();

    const empty = await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual([]);

    const [skill] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId,
        name: 'No secrets',
        description: 'Never commit a live key',
        type: 'security',
        source: 'manual',
        body: 'Flag any hardcoded secret.',
      })
      .returning();

    const set = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [skill!.id] },
    });
    expect(set.statusCode).toBe(200);
    const links = set.json();
    expect(links).toHaveLength(1);
    expect(Object.keys(links[0]).sort()).toEqual(['agent_id', 'order', 'skill_id'].sort());

    const after = await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` });
    expect(after.json()).toHaveLength(1);
    await app.close();
  });

  it('GET /agents/:id/models and GET /providers/:id/models → ModelInfo[]', async () => {
    const app = await makeApp();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'ModelsAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();

    const viaAgent = await app.inject({ method: 'GET', url: `/agents/${agent.id}/models` });
    expect(viaAgent.statusCode).toBe(200);
    expect(Array.isArray(viaAgent.json())).toBe(true);

    const viaProvider = await app.inject({ method: 'GET', url: '/providers/openai/models' });
    expect(viaProvider.statusCode).toBe(200);
    const models = viaProvider.json();
    expect(Array.isArray(models)).toBe(true);
    if (models.length > 0) {
      // pricing is `.nullish()` on ModelInfo (contracts/adapters.ts) — don't
      // assert it's present, only that no UNDECLARED key rides along.
      const allowedKeys = ['id', 'provider', 'label', 'created', 'contextLength', 'pricing'];
      for (const key of Object.keys(models[0])) {
        expect(allowedKeys).toContain(key);
      }
    }
    await app.close();
  });

  it('POST /repos/:id/refresh → {status: "refreshing"}', async () => {
    const app = await makeApp();
    const repo = (
      await app.inject({ method: 'POST', url: '/repos', payload: { url: 'https://github.com/acme/refresh-me' } })
    ).json();
    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/refresh` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'refreshing' });
    await app.close();
  });

  it('DELETE /repos/:id → {deleted: <id>}', async () => {
    const app = await makeApp();
    const repo = (
      await app.inject({ method: 'POST', url: '/repos', payload: { url: 'https://github.com/acme/delete-me' } })
    ).json();
    const res = await app.inject({ method: 'DELETE', url: `/repos/${repo.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ deleted: repo.id });
    await app.close();
  });

  it('GET /settings → all six Settings keys, defaults backfilled by the response: schema', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/settings' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // `rowsToSettings` (settings/helpers.ts:10) only collapses whichever rows
    // exist in `t.settings` and `as Settings`-casts the result — on its own
    // it would return only the persisted subset. Wave 1.2 step D's
    // `response: Settings` schema now runs that object through
    // `Settings.safeParse` before serializing, and every field on
    // `SettingsKnown` (contracts/platform.ts) carries a `.default()` — so
    // an unconfigured workspace's missing keys (`automatic_reviews`,
    // `feature_models`) are backfilled on the wire, not just documented in
    // the contract. This assertion intentionally changed from "4 keys" to
    // "6 keys" in the same commit that added the schema (see git history —
    // do not silently re-tighten this back to 4 if it ever regresses).
    expect(Object.keys(body).sort()).toEqual(
      [
        'polling_interval_min',
        'theme',
        'density',
        'sync_to_folder',
        'automatic_reviews',
        'feature_models',
      ].sort(),
    );
    await app.close();
  });

  it('GET /repos/:id/index-state → RepoIndexState keys (updatedAt mapped to ISO by toIndexStateDto, step B)', async () => {
    const app = await makeApp();
    const repo = (
      await app.inject({ method: 'POST', url: '/repos', payload: { url: 'https://github.com/acme/idx' } })
    ).json();
    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/index-state` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // No `repo_index_state` row exists yet for a freshly-added repo, so
    // `getIndexState` synthesises the degraded fallback (service.ts:189-202)
    // rather than returning a persisted row — hence `reason`/`degraded`/
    // `degradedReason` are all present, not just optionally so.
    expect(Object.keys(body).sort()).toEqual(
      [
        'status',
        'filesIndexed',
        'filesSkipped',
        'durationMs',
        'reason',
        'repoId',
        'lastIndexedSha',
        'indexerVersion',
        'updatedAt',
        'degraded',
        'degradedReason',
      ].sort(),
    );
    // Step B (repo-intel/helpers.ts:toIndexStateDto) now maps `updatedAt`
    // to an ISO string explicitly, ahead of any `response:` schema — the
    // facade itself still returns a `Date` (repo-intel/types.ts:46).
    expect(typeof body.updatedAt).toBe('string');
    await app.close();
  });

  it('POST /repos/:id/resync → 202, {status:"accepted", ...}', async () => {
    const app = await makeApp();
    const repo = (
      await app.inject({ method: 'POST', url: '/repos', payload: { url: 'https://github.com/acme/resync' } })
    ).json();
    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/resync` });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.status).toBe('accepted');
    // Either the happy path (jobId) or the degraded no-handler path — both
    // are legitimate today; assert the shape is one of the two, not a value.
    if ('jobId' in body) {
      expect(Object.keys(body).sort()).toEqual(['status', 'jobId'].sort());
    } else {
      expect(Object.keys(body).sort()).toEqual(['status', 'degraded', 'reason'].sort());
    }
    await app.close();
  });
});

const MINIMAL_REVIEW: Review = {
  verdict: 'approve',
  summary: 'Looks fine.',
  score: 95,
  findings: [],
};

/** Poll `jobs` until every row has left 'queued'/'running' (or time out). */
async function waitForJobs(db: PgFixture['handle']['db'], timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  for (;;) {
    const rows = await db.select({ status: t.jobs.status }).from(t.jobs);
    if (rows.every((r) => r.status === 'done' || r.status === 'failed')) return;
    if (Date.now() - start > timeoutMs) return;
    await new Promise((r) => setTimeout(r, 25));
  }
}
