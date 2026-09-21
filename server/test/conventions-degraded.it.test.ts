import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { makeRepoIntelStub } from './helpers/repo-intel-stub.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * DB-backed coverage for the extractor's degradation paths
 * (server/AGENTS.md: enrichment failures never crash a run; LLM failures
 * never leave partial data behind):
 *   - no clone → 422 up front, no scan row, zero tokens spent
 *   - no samples at all → `done` scan, `degraded: true`, zero LLM calls
 *   - repo-intel throws → configs-only degrade (still 1 LLM call if configs exist)
 *   - LLM throws → scan `failed`, nothing persisted to `conventions`
 */
d('conventions extractor — degradation (DB-backed)', () => {
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
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient(), ...overrides },
    });
  }

  async function waitForScan(scanId: string, timeoutMs = 5000) {
    const start = Date.now();
    for (;;) {
      const [row] = await pg.handle.db
        .select()
        .from(t.conventionScans)
        .where(eq(t.conventionScans.id, scanId));
      if (row && (row.status === 'done' || row.status === 'failed')) return row;
      if (Date.now() - start > timeoutMs) return row;
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  it('422s up front when the repo has no clone — no scan row is created', async () => {
    const app = await makeApp({ repoIntel: makeRepoIntelStub() });
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'no-clone', fullName: 'acme/no-clone', clonePath: null })
      .returning();

    const res = await app.inject({ method: 'POST', url: `/repos/${repo!.id}/conventions/extract` });
    expect(res.statusCode).toBe(422);

    const scans = await pg.handle.db
      .select()
      .from(t.conventionScans)
      .where(eq(t.conventionScans.repoId, repo!.id));
    expect(scans).toHaveLength(0);

    await app.close();
  });

  it('no samples at all (no config files, no ranked code files) → done + degraded, zero LLM calls', async () => {
    const cloneDir = await mkdtemp(join(tmpdir(), 'devdigest-conventions-empty-'));
    try {
      const llm = new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: { candidates: [] } } });
      const app = await makeApp({ llm: { openrouter: llm }, repoIntel: makeRepoIntelStub({ rankedPaths: [] }) });
      const [repo] = await pg.handle.db
        .insert(t.repos)
        .values({ workspaceId, owner: 'acme', name: 'empty-clone', fullName: 'acme/empty-clone', clonePath: cloneDir })
        .returning();

      const { scan_id } = (await app.inject({ method: 'POST', url: `/repos/${repo!.id}/conventions/extract` })).json();
      const scanRow = await waitForScan(scan_id);

      expect(scanRow!.status).toBe('done');
      expect(scanRow!.degraded).toBe(true);
      expect(scanRow!.degradedReason).toBe('no_data');
      expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(0);

      const list = (await app.inject({ method: 'GET', url: `/repos/${repo!.id}/conventions` })).json();
      expect(list.candidates).toHaveLength(0);

      await app.close();
    } finally {
      await rm(cloneDir, { recursive: true, force: true });
    }
  });

  it('repo-intel throwing degrades to a configs-only run instead of crashing', async () => {
    const cloneDir = await mkdtemp(join(tmpdir(), 'devdigest-conventions-configs-'));
    try {
      await writeFile(join(cloneDir, 'package.json'), '{"name":"x"}\n');
      const llm = new MockLLMProvider('openai', {
        structuredBySchema: {
          ConventionExtraction: {
            candidates: [
              { category: 'other', rule: 'Config rule', evidence: { file: 'package.json', line: 1 }, confidence: 0.6 },
            ],
          },
        },
      });
      const app = await makeApp({
        llm: { openrouter: llm },
        repoIntel: makeRepoIntelStub({ throwOnRank: true }),
      });
      const [repo] = await pg.handle.db
        .insert(t.repos)
        .values({ workspaceId, owner: 'acme', name: 'configs-only', fullName: 'acme/configs-only', clonePath: cloneDir })
        .returning();

      const { scan_id } = (await app.inject({ method: 'POST', url: `/repos/${repo!.id}/conventions/extract` })).json();
      const scanRow = await waitForScan(scan_id);

      expect(scanRow!.status).toBe('done');
      expect(scanRow!.degraded).toBe(true);
      expect(scanRow!.degradedReason).toBe('no_ranked_files');
      expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);

      const list = (await app.inject({ method: 'GET', url: `/repos/${repo!.id}/conventions` })).json();
      expect(list.candidates).toHaveLength(1);
      expect(list.candidates[0].rule).toBe('Config rule');

      await app.close();
    } finally {
      await rm(cloneDir, { recursive: true, force: true });
    }
  });

  it('LLM failure marks the scan failed and persists nothing', async () => {
    const cloneDir = await mkdtemp(join(tmpdir(), 'devdigest-conventions-llmfail-'));
    try {
      await mkdir(join(cloneDir, 'src'), { recursive: true });
      await writeFile(join(cloneDir, 'src', 'a.ts'), 'export const a = 1;\n');

      const throwingLlm = {
        id: 'openrouter' as const,
        async listModels() {
          return [];
        },
        async complete() {
          throw new Error('should not be called');
        },
        async completeStructured() {
          throw new Error('provider unavailable');
        },
        async embed() {
          return [];
        },
      };
      const app = await makeApp({
        llm: { openrouter: throwingLlm },
        repoIntel: makeRepoIntelStub({ rankedPaths: ['src/a.ts'] }),
      });
      const [repo] = await pg.handle.db
        .insert(t.repos)
        .values({ workspaceId, owner: 'acme', name: 'llm-fail', fullName: 'acme/llm-fail', clonePath: cloneDir })
        .returning();

      const { scan_id } = (await app.inject({ method: 'POST', url: `/repos/${repo!.id}/conventions/extract` })).json();
      const scanRow = await waitForScan(scan_id);

      expect(scanRow!.status).toBe('failed');
      expect(scanRow!.error).toContain('provider unavailable');

      const list = (await app.inject({ method: 'GET', url: `/repos/${repo!.id}/conventions` })).json();
      expect(list.candidates).toHaveLength(0);

      await app.close();
    } finally {
      await rm(cloneDir, { recursive: true, force: true });
    }
  });
});
