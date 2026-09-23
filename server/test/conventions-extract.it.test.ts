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
 * DB-backed coverage for the conventions extractor's happy path + every
 * code-side verification rejection + rerun-preserves-decisions + restart
 * durability + "exactly one LLM call" (server/specs/L02-conventions-extractor.api.md).
 * Integration tests call `seed()` rather than hand-rolling a workspace row
 * (server/INSIGHTS.md, 2026-09-21).
 */
d('conventions extractor (DB-backed)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let cloneDir: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;

    cloneDir = await mkdtemp(join(tmpdir(), 'devdigest-conventions-'));
    await mkdir(join(cloneDir, 'src'), { recursive: true });
    // Line 1 is real + non-blank (verifiable); line 2 is blank (unverifiable).
    await writeFile(join(cloneDir, 'src', 'foo.ts'), 'export function foo() {}\n\nconst x = 1;\n');
    await writeFile(join(cloneDir, 'package.json'), '{"name":"widgets"}\n');
  });

  afterAll(async () => {
    await rm(cloneDir, { recursive: true, force: true });
    await pg?.stop();
  });

  async function makeRepo(name: string) {
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name,
        fullName: `acme/${name}`,
        clonePath: cloneDir,
      })
      .returning();
    await pg.handle.db.insert(t.repoIndexState).values({
      repoId: repo!.id,
      lastIndexedSha: 'sha-123',
      indexerVersion: 2,
      status: 'full',
    });
    return repo!;
  }

  function makeApp(llm: MockLLMProvider, rankedPaths: string[]) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openrouter: llm },
        repoIntel: makeRepoIntelStub({ rankedPaths }),
      },
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

  it('happy path: verified candidates are persisted, scan reaches done, evidence_url is derived', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        ConventionExtraction: {
          candidates: [
            {
              category: 'structure',
              rule: 'Export top-level functions',
              evidence: { file: 'src/foo.ts', line: 1 },
              confidence: 0.9,
            },
          ],
        },
      },
    });
    const app = await makeApp(llm, ['src/foo.ts']);
    const repo = await makeRepo('happy');

    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` });
    expect(res.statusCode).toBe(202);
    const { scan_id, job_id } = res.json();
    expect(job_id).not.toBeNull();

    const scanRow = await waitForScan(scan_id);
    expect(scanRow!.status).toBe('done');
    expect(scanRow!.candidatesProposed).toBe(1);
    expect(scanRow!.candidatesVerified).toBe(1);

    const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` })).json();
    expect(list.scan.status).toBe('done');
    expect(list.candidates).toHaveLength(1);
    const c = list.candidates[0];
    expect(c.rule).toBe('Export top-level functions');
    expect(c.evidence_path).toBe('src/foo.ts');
    expect(c.evidence_line).toBe(1);
    expect(c.evidence_url).toBe('https://github.com/acme/happy/blob/sha-123/src/foo.ts#L1');
    expect(c.status).toBe('pending');

    // Exactly one LLM call for the whole extraction.
    expect(llm.calls.filter((call) => call.method === 'completeStructured')).toHaveLength(1);

    await app.close();
  });

  it('rejects candidates citing an unsampled file, an out-of-range line, or a blank line', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        ConventionExtraction: {
          candidates: [
            { category: 'naming', rule: 'Good rule', evidence: { file: 'src/foo.ts', line: 1 }, confidence: 0.8 },
            { category: 'naming', rule: 'Unsampled file', evidence: { file: 'src/not-shown.ts', line: 1 }, confidence: 0.8 },
            { category: 'naming', rule: 'Out of range', evidence: { file: 'src/foo.ts', line: 999 }, confidence: 0.8 },
            { category: 'naming', rule: 'Blank line', evidence: { file: 'src/foo.ts', line: 2 }, confidence: 0.8 },
          ],
        },
      },
    });
    const app = await makeApp(llm, ['src/foo.ts']);
    const repo = await makeRepo('rejections');

    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` });
    const { scan_id } = res.json();
    const scanRow = await waitForScan(scan_id);

    expect(scanRow!.candidatesProposed).toBe(4);
    expect(scanRow!.candidatesVerified).toBe(1); // only "Good rule" survives verification

    const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` })).json();
    expect(list.candidates.map((c: { rule: string }) => c.rule)).toEqual(['Good rule']);

    await app.close();
  });

  it('a re-scan replaces pending candidates but preserves accepted/rejected decisions', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        ConventionExtraction: {
          candidates: [
            { category: 'naming', rule: 'Rule A', evidence: { file: 'src/foo.ts', line: 1 }, confidence: 0.8 },
          ],
        },
      },
    });
    const app = await makeApp(llm, ['src/foo.ts']);
    const repo = await makeRepo('rerun');

    const first = (await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })).json();
    await waitForScan(first.scan_id);
    const firstList = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` })).json();
    const candidateId = firstList.candidates[0].id;

    // Human accepts it.
    const accepted = (
      await app.inject({ method: 'PATCH', url: `/conventions/${candidateId}`, payload: { status: 'accepted' } })
    ).json();
    expect(accepted.status).toBe('accepted');

    // Re-scan proposes a DIFFERENT rule.
    const llm2 = new MockLLMProvider('openai', {
      structuredBySchema: {
        ConventionExtraction: {
          candidates: [
            { category: 'testing', rule: 'Rule B', evidence: { file: 'src/foo.ts', line: 1 }, confidence: 0.7 },
          ],
        },
      },
    });
    const app2 = await makeApp(llm2, ['src/foo.ts']);
    const second = (await app2.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })).json();
    await waitForScan(second.scan_id);

    const secondList = (await app2.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` })).json();
    const rules = secondList.candidates.map((c: { rule: string; status: string }) => [c.rule, c.status]);
    expect(rules).toContainEqual(['Rule A', 'accepted']); // preserved decision
    expect(rules).toContainEqual(['Rule B', 'pending']); // new pending row

    await app.close();
    await app2.close();
  });

  it('restart durability: a fresh app instance reads the identical persisted rows', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        ConventionExtraction: {
          candidates: [
            { category: 'naming', rule: 'Durable rule', evidence: { file: 'src/foo.ts', line: 1 }, confidence: 0.6 },
          ],
        },
      },
    });
    const app = await makeApp(llm, ['src/foo.ts']);
    const repo = await makeRepo('durable');

    const { scan_id } = (await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })).json();
    await waitForScan(scan_id);
    const before = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` })).json();
    await app.close();

    // Simulate a restart: a brand-new app instance over the same DB.
    const app2 = await makeApp(llm, ['src/foo.ts']);
    const after = (await app2.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` })).json();
    expect(after).toEqual(before);
    await app2.close();
  });
});
