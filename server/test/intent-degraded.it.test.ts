import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { IssueMeta, RepoRef } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/**
 * DB-backed coverage for `IntentService#ensureIntent`'s degradation ladder
 * (server/specs/L03-intent-layer.api.md §Tests, §"The derivation algorithm"
 * step 7): a throwing derivation LLM never fails the REVIEW run and never
 * injects an intent prompt section; a failed issue fetch is recorded as
 * `unavailable`, never fabricated, and the model's own `context_gaps` text
 * passes through verbatim.
 */

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

let repoSeq = 0;
async function makeRepoAndPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  body: string | null,
) {
  const name = `intent-degraded-${repoSeq++}`;
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
      headSha: 'sha-degraded-1',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body,
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

/** A `completeStructured`-throwing provider — mirrors the throwing-LLM
 *  fixture in `test/conventions-degraded.it.test.ts`. */
const throwingIntentLlm = {
  id: 'openrouter' as const,
  async listModels() {
    return [];
  },
  async complete(): Promise<never> {
    throw new Error('should not be called');
  },
  async completeStructured(): Promise<never> {
    throw new Error('intent provider unavailable');
  },
  async embed() {
    return [];
  },
};

/** A GitHub client whose `getIssue` always fails — every other method
 *  delegates to `MockGitHubClient`'s defaults. */
class ThrowingIssueGitHubClient extends MockGitHubClient {
  async getIssue(_repo: RepoRef, _n: number): Promise<IssueMeta> {
    throw new Error('issue fetch failed');
  }
}

d('intent degradation (DB-backed)', () => {
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

  function makeApp(overrides: Parameters<typeof buildApp>[0]['overrides'] = {}) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { git: new MockGitClient({ diff: DIFF }), github: new MockGitHubClient(), ...overrides },
    });
  }

  it('a throwing intent LLM leaves the review run done, not failed, with no intent prompt section', async () => {
    const reviewLlm = new MockLLMProvider('openai', {
      structured: { verdict: 'approve', summary: 'Looks good.', score: 100, findings: [] },
    });
    const app = await makeApp({ llm: { openai: reviewLlm, openrouter: throwingIntentLlm } });
    // No issue reference in the body — isolates this test to the LLM throw,
    // independent of the issue-fetch degradation covered below.
    const { pr } = await makeRepoAndPr(pg.handle.db, workspaceId, 'Add rate limiting.');

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id;

    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('done');
    expect(run!.error).toBeNull();

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.prompt_assembly.intent).toBeNull();
    expect(trace.prompt_assembly.intent_tokens).toBeNull();
    expect(trace.prompt_assembly.user).not.toContain('PR intent (derived)');

    // The reviewer's own call still happened and produced the finding-free review.
    expect(reviewLlm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);

    await app.close();
  });

  it('a failed issue fetch is recorded as unavailable, never fabricated, and the model\'s own context_gaps text passes through verbatim', async () => {
    const contextGaps = ['Issue #55 could not be fetched from GitHub; its content is unknown.'];
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        IntentExtraction: {
          intent: 'Fix the reported bug referenced by the closed issue.',
          in_scope: ['Fix the bug'],
          out_of_scope: [],
          context_gaps: contextGaps,
          confidence: 'high', // deliberately over-claimed; must be clamped down
        },
      },
    });
    const app = await makeApp({
      llm: { openrouter: llm },
      github: new ThrowingIssueGitHubClient(),
    });
    const { pr } = await makeRepoAndPr(pg.handle.db, workspaceId, 'Closes #55.');

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    const record = res.json();

    const issueSource = record.sources.find((s: { kind: string }) => s.kind === 'issue');
    expect(issueSource).toMatchObject({ kind: 'issue', status: 'unavailable', ref: '#55' });

    // Passed through verbatim — our code neither drops nor invents entries.
    expect(record.context_gaps).toEqual(contextGaps);

    // An `unavailable` source caps confidence at `medium` regardless of the
    // model's own (over-claimed) `high` proposal (helpers.ts#clampConfidence).
    expect(record.confidence).toBe('medium');

    await app.close();
  });
});
