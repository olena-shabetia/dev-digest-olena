import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/**
 * DB-backed coverage for `IntentService#ensureIntent`/`deriveIntent`
 * (server/specs/L03-intent-layer.api.md §Tests): provenance persistence,
 * the head_sha cache making a second call LLM-free, `force: true` bypassing
 * that cache, and workspace isolation on both routes.
 */

/** IntentExtraction fixture matching `modules/intent/schemas.ts`. */
const INTENT_FIXTURE = {
  intent: 'Add rate limiting to the public API endpoints.',
  in_scope: ['Add a rate-limit middleware', 'Wire it into the public API router'],
  out_of_scope: ['Auth changes'],
  context_gaps: [],
  confidence: 'high',
};

let repoSeq = 0;
async function makeRepoAndPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  body = 'Add rate limiting. Closes #100.',
) {
  const name = `intent-repo-${repoSeq++}`;
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
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'sha-intent-1',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body,
    })
    .returning();
  return { repo: repo!, pr: pr! };
}

d('intent extraction (DB-backed)', () => {
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

  function makeApp(llm: MockLLMProvider) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openrouter: llm },
      },
    });
  }

  it('derives once, persists full provenance, hits the head_sha cache on a second call, and force re-derives', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { IntentExtraction: INTENT_FIXTURE } });
    const app = await makeApp(llm);
    const { pr } = await makeRepoAndPr(pg.handle.db, workspaceId);

    const first = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(first.statusCode).toBe(200);
    const record = first.json();

    expect(record.intent).toBe(INTENT_FIXTURE.intent);
    expect(record.in_scope).toEqual(INTENT_FIXTURE.in_scope);
    expect(record.out_of_scope).toEqual(INTENT_FIXTURE.out_of_scope);
    expect(record.confidence).toBe('high');
    expect(record.pr_id).toBe(pr.id);
    expect(record.head_sha).toBe(pr.headSha);
    expect(record.provider).toBe('openrouter');
    expect(record.model).toBe('deepseek/deepseek-v4-flash');
    expect(record.error).toBeNull();
    expect(typeof record.tokens_in).toBe('number');
    expect(typeof record.tokens_out).toBe('number');
    expect(typeof record.cost_usd).toBe('number');
    expect(typeof record.generated_at).toBe('string');
    expect(record.sources.length).toBeGreaterThan(0);

    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);

    // Same head_sha, force not set — cache hit, zero additional LLM calls.
    const second = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(second.statusCode).toBe(200);
    expect(second.json().generated_at).toBe(record.generated_at);
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);

    // GET reads the identical persisted row without touching the LLM either.
    const got = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(got.statusCode).toBe(200);
    expect(got.json()).toEqual(record);
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);

    // `force: true` bypasses the cache and re-derives.
    const third = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent`, payload: { force: true } });
    expect(third.statusCode).toBe(200);
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(2);

    await app.close();
  });

  it('a PR with no derived intent yet returns null on GET', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { IntentExtraction: INTENT_FIXTURE } });
    const app = await makeApp(llm);
    const { pr } = await makeRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
    expect(llm.calls).toHaveLength(0);

    await app.close();
  });

  it('workspace isolation: a PR belonging to another workspace 404s on both GET and POST', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { IntentExtraction: INTENT_FIXTURE } });
    const app = await makeApp(llm);

    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'Other workspace' }).returning();
    const { pr } = await makeRepoAndPr(pg.handle.db, otherWs!.id);

    const getRes = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(getRes.statusCode).toBe(404);

    const postRes = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(postRes.statusCode).toBe(404);

    expect(llm.calls).toHaveLength(0);

    await app.close();
  });
});
