import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type {
  ChatMessage,
  CompletionRequest,
  CompletionResult,
  LLMProvider,
  ModelInfo,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { EvalRepository } from '../src/modules/eval/repository.js';

/**
 * L06 eval pipeline — HTTP integration tests against real Postgres.
 *
 * Fixture `fixtures/eval/two-hunk.diff` (one file, src/eval-fixture.ts), new-side lines:
 *   hunk 1  `@@ -3,4 +3,5 @@`   lines 3..7   (added line: 5, `hunkOneAdded`)
 *   hunk 2  `@@ -40,4 +41,5 @@` lines 41..45  (added line: 43, `hunkTwoAdded`; 45 is its last line)
 * Lines 8..40 belong to no hunk (20 is used as the "off every hunk" line).
 *
 * Tests run in order and share state (a case saved early is run later).
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const FIXTURE_DIFF = readFileSync(
  fileURLToPath(new URL('./fixtures/eval/two-hunk.diff', import.meta.url)),
  'utf8',
);
const FILE = 'src/eval-fixture.ts';
const HUNK1_HEADER = '@@ -3,4 +3,5 @@';
const HUNK2_HEADER = '@@ -40,4 +41,5 @@';
const HUNK1_ADDED = '+const hunkOneAdded = 10;';
const HUNK2_ADDED = '+const hunkTwoAdded = 20;';
const RANDOM_UUID = '00000000-0000-4000-8000-000000000001';

// ---------- scripted LLM ----------

type LlmReply = { findings: Array<{ start: number; end: number }> };
type Handler = (messages: ChatMessage[], callIndex: number) => LlmReply | Promise<LlmReply>;

function review(reply: LlmReply) {
  return {
    verdict: 'comment',
    summary: 'scripted',
    score: 50,
    findings: reply.findings.map((f, i) => ({
      id: `scripted-${i}`,
      severity: 'WARNING',
      category: 'bug',
      title: `Scripted finding ${i}`,
      file: FILE,
      start_line: f.start,
      end_line: f.end,
      rationale: 'scripted',
      confidence: 0.9,
      kind: 'finding',
    })),
  };
}

class ScriptedLLM implements LLMProvider {
  readonly id = 'openai' as const;
  structuredCalls = 0;
  handler: Handler = () => ({ findings: [{ start: 43, end: 43 }] });

  async listModels(): Promise<ModelInfo[]> {
    return [];
  }
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    return { text: '', model: req.model, tokensIn: 0, tokensOut: 0, costUsd: 0 };
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const index = this.structuredCalls++;
    const reply = await this.handler(req.messages, index);
    const fixture = review(reply);
    const data = (req.schema as z.ZodType<T>).parse(fixture);
    return {
      data,
      model: req.model,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
      raw: JSON.stringify(fixture),
      attempts: 1,
    };
  }
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => []);
  }
}

// ---------- shape helpers ----------

interface Draft {
  finding_id: string;
  agent_id: string;
  name: string;
  input_diff: string;
  expectation: { type: string; file: string; start_line: number; end_line: number };
  needs_relocation: boolean;
}

// Loosely typed JSON bodies: assertions below name the fields they check.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

d('L06 eval pipeline (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const llm = new ScriptedLLM();

  let workspaceId: string;
  let prId: string;
  let generalId: string;

  const ids = {
    hunk2: '',
    span: '',
    last: '',
    fullFile: '',
    offHunk: '',
    undecided: '',
  };

  const saved: Record<string, { id: string; expectation: { severity: string; category: string; title: string } }> = {};
  const draftRunByFinding: Record<string, { status: string; matched: number }> = {};

  async function json(res: { json: () => unknown }) {
    return res.json() as Json;
  }

  async function counts() {
    const one = async (table: string) => {
      const r = await pg.handle.db.execute(sql.raw(`select count(*)::int as n from ${table}`));
      return Number((r as unknown as Array<{ n: number }>)[0]!.n);
    };
    return {
      eval_cases: await one('eval_cases'),
      eval_runs: await one('eval_runs'),
      eval_set_runs: await one('eval_set_runs'),
      reviews: await one('reviews'),
      findings: await one('findings'),
      agent_runs: await one('agent_runs'),
      run_traces: await one('run_traces'),
    };
  }

  /** Counts that the eval feature must never move (everything but eval_cases / eval_set_runs). */
  function untouched(c: Awaited<ReturnType<typeof counts>>) {
    const { eval_cases: _a, eval_set_runs: _b, ...rest } = c;
    void _a;
    void _b;
    return rest;
  }

  async function makeFinding(
    agentId: string,
    spec: { start: number; end: number; kind?: string; title: string },
    decision: 'accept' | 'dismiss' | null,
  ): Promise<string> {
    const db = pg.handle.db;
    const [rev] = await db
      .insert(t.reviews)
      .values({ workspaceId, prId, agentId, kind: 'review', verdict: 'comment', summary: 's', score: 50, model: 'm' })
      .returning();
    const [f] = await db
      .insert(t.findings)
      .values({
        reviewId: rev!.id,
        file: FILE,
        startLine: spec.start,
        endLine: spec.end,
        severity: 'CRITICAL',
        category: 'security',
        title: spec.title,
        rationale: 'r',
        confidence: 0.9,
        kind: spec.kind ?? 'finding',
      })
      .returning();
    if (decision) {
      const res = await app.inject({ method: 'POST', url: `/findings/${f!.id}/${decision}` });
      expect(res.statusCode).toBe(200);
    }
    return f!.id;
  }

  async function createAgent(name: string, systemPrompt: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: systemPrompt },
    });
    expect(res.statusCode).toBe(201);
    return (await json(res)).id;
  }

  async function agentWithCase(name: string, prompt: string) {
    const agentId = await createAgent(name, prompt);
    const fid = await makeFinding(agentId, { start: 43, end: 43, title: `${name} finding` }, 'accept');
    const draft = (await getDraft(fid)).body.draft as Draft;
    const made = await postCase({
      finding_id: fid,
      name: `${name} case`,
      input_diff: draft.input_diff,
      expectation: loc(draft),
      displayed_type: 'must_find',
    });
    expect(made.statusCode).toBe(201);
    return { agentId, caseId: (await json(made)).id as string };
  }

  async function getDraft(findingId: string): Promise<{ status: number; body: Json }> {
    const res = await app.inject({ method: 'GET', url: `/findings/${findingId}/eval-draft` });
    return { status: res.statusCode, body: await json(res) };
  }

  function loc(d: Draft) {
    return { file: d.expectation.file, start_line: d.expectation.start_line, end_line: d.expectation.end_line };
  }

  async function postDraftRun(payload: Record<string, unknown>) {
    return app.inject({ method: 'POST', url: '/eval-cases/draft-run', payload });
  }

  async function postCase(payload: Record<string, unknown>) {
    return app.inject({ method: 'POST', url: '/eval-cases', payload });
  }

  async function waitRun(runId: string): Promise<Json> {
    for (let i = 0; i < 400; i++) {
      const res = await app.inject({ method: 'GET', url: `/eval-runs/${runId}` });
      const body = await json(res);
      if (body.status !== 'running') return body;
      await sleep(25);
    }
    throw new Error('eval run did not finish');
  }

  async function startRun(agentId: string) {
    const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
    return { status: res.statusCode, body: await json(res) };
  }

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;

    const agents = await pg.handle.db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
    generalId = agents.find((a) => a.name === 'General Reviewer')!.id;

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'eval-fixture', fullName: 'acme/eval-fixture' })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 901,
        title: 'Eval fixture PR',
        author: 'marisa.koch',
        branch: 'feat/eval',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 2,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'Eval fixture body.',
      })
      .returning();
    prId = pr!.id;

    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: FIXTURE_DIFF }),
        github: new MockGitHubClient(),
        // The seeded agents resolve through openrouter, agents created here through openai.
        llm: { openai: llm, openrouter: llm, anthropic: llm },
      },
    });

    // Findings on the General Reviewer's review (a seeded agent).
    ids.hunk2 = await makeFinding(generalId, { start: 43, end: 43, title: 'Hunk two finding' }, 'accept');
    ids.span = await makeFinding(generalId, { start: 5, end: 43, title: 'Spanning finding' }, 'dismiss');
    ids.last = await makeFinding(generalId, { start: 45, end: 45, title: 'Last line finding' }, 'accept');
    ids.fullFile = await makeFinding(
      generalId,
      { start: 20, end: 20, kind: 'secret_leak', title: 'Full-file finding' },
      'accept',
    );
    ids.offHunk = await makeFinding(generalId, { start: 20, end: 20, title: 'Off-hunk finding' }, 'accept');
    ids.undecided = await makeFinding(generalId, { start: 5, end: 5, title: 'Undecided finding' }, null);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  // ------------------------------------------------------------------ draft

  it('drafts: type from the decision, only the intersecting hunk, every draft is valid as returned', async () => {
    const before = await counts();

    const h2 = await getDraft(ids.hunk2);
    expect(h2.status).toBe(200);
    expect(h2.body.kind).toBe('draft');
    const d2 = h2.body.draft as Draft;
    expect(d2.expectation.type).toBe('must_find');
    expect(d2.needs_relocation).toBe(false);
    // A-41: only hunk 2, not hunk 1.
    expect(d2.input_diff).toContain(HUNK2_HEADER);
    expect(d2.input_diff).toContain(HUNK2_ADDED);
    expect(d2.input_diff).not.toContain(HUNK1_HEADER);
    expect(d2.input_diff).not.toContain(HUNK1_ADDED);

    const span = await getDraft(ids.span);
    const dSpan = span.body.draft as Draft;
    expect(dSpan.expectation.type).toBe('must_not_flag');
    expect(dSpan.input_diff).toContain(HUNK1_HEADER);
    expect(dSpan.input_diff).toContain(HUNK2_HEADER);

    const last = await getDraft(ids.last);
    const dLast = last.body.draft as Draft;
    expect(dLast.expectation.end_line).toBe(45);
    expect(dLast.needs_relocation).toBe(false);

    // A-6b / A-7 / criterion 3: every returned non-relocation draft is accepted as returned.
    for (const [id, dr] of [
      [ids.hunk2, d2],
      [ids.span, dSpan],
      [ids.last, dLast],
    ] as const) {
      const res = await postDraftRun({ finding_id: id, input_diff: dr.input_diff, expectation: loc(dr) });
      expect(res.statusCode).toBe(200);
      const body = await json(res);
      draftRunByFinding[id] = { status: body.status, matched: body.matched };
    }

    // Undecided / unknown / outdated.
    const undecided = await getDraft(ids.undecided);
    expect(undecided.status).toBe(409);
    expect(undecided.body.error.code).toBe('eval_finding_undecided');
    expect((await getDraft(RANDOM_UUID)).status).toBe(404);
    const off = await getDraft(ids.offHunk);
    expect(off.status).toBe(409);
    expect(off.body.error.code).toBe('eval_finding_outdated');

    // A-41a: a full-file-kind finding off every hunk gets both hunks + needs_relocation.
    const full = await getDraft(ids.fullFile);
    expect(full.status).toBe(200);
    const dFull = full.body.draft as Draft;
    expect(dFull.needs_relocation).toBe(true);
    expect(dFull.input_diff).toContain(HUNK1_HEADER);
    expect(dFull.input_diff).toContain(HUNK2_HEADER);
    for (const run of [
      () => postDraftRun({ finding_id: ids.fullFile, input_diff: dFull.input_diff, expectation: loc(dFull) }),
      () =>
        postCase({
          finding_id: ids.fullFile,
          name: 'Full file',
          input_diff: dFull.input_diff,
          expectation: loc(dFull),
        }),
    ]) {
      const res = await run();
      expect(res.statusCode).toBe(422);
      const body = await json(res);
      expect(body.error.code).toBe('eval_invalid_expectation');
      expect(body.error.details.reason).toBe('outside_hunks');
    }
    // Moved into a hunk: accepted by draft run.
    const moved = { file: FILE, start_line: 43, end_line: 43 };
    const ok = await postDraftRun({ finding_id: ids.fullFile, input_diff: dFull.input_diff, expectation: moved });
    expect(ok.statusCode).toBe(200);

    // Nothing but the draft runs' reads happened: no eval rows written.
    const after = await counts();
    expect(after).toEqual(before);
  });

  // -------------------------------------------------------------- draft run

  it('draft run: one provider call, nothing persisted; malformed input is rejected with its own code and reason', async () => {
    const d2 = (await getDraft(ids.hunk2)).body.draft as Draft;
    const before = await counts();
    const callsBefore = llm.structuredCalls;

    const res = await postDraftRun({ finding_id: ids.hunk2, input_diff: d2.input_diff, expectation: loc(d2) });
    expect(res.statusCode).toBe(200);
    const body = await json(res);
    expect(llm.structuredCalls - callsBefore).toBe(1);
    expect(body.expectation_type).toBe('must_find');
    expect(body.status).toBe('passed');
    expect(body.matched).toBe(1);
    expect(body.expected).toBe(1);
    expect(body.findings).toHaveLength(1);
    expect(body.findings[0].matched).toBe(true);
    expect(await counts()).toEqual(before);

    const stripped = await postDraftRun({
      finding_id: ids.hunk2,
      input_diff: d2.input_diff,
      expectation: loc(d2),
      severity: 'SUGGESTION',
      category: 'style',
      title: 'attacker title',
      owner_id: RANDOM_UUID,
      type: 'must_not_flag',
    });
    expect(stripped.statusCode).toBe(200);
    expect((await json(stripped)).expectation_type).toBe('must_find');

    const callsMid = llm.structuredCalls;
    const twoFile =
      `diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,1 +1,1 @@\n-a\n+b\n` +
      `diff --git a/b.ts b/b.ts\n--- a/b.ts\n+++ b/b.ts\n@@ -1,1 +1,1 @@\n-a\n+b\n`;
    const twoBare =
      `--- a/a.ts\n+++ b/a.ts\n@@ -1,1 +1,1 @@\n-a\n+b\n--- a/b.ts\n+++ b/b.ts\n@@ -1,1 +1,1 @@\n-a\n+b\n`;
    const noHunk = 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n';
    const goodLoc = loc(d2);

    const diffCases: Array<[string, string, string]> = [
      ['empty', '', 'empty'],
      ['prose', 'this is just prose, not a diff', 'unparseable'],
      ['two files', twoFile, 'multiple_files'],
      ['two bare +++ blocks', twoBare, 'multiple_files'],
      ['no hunk', noHunk, 'no_hunk'],
    ];
    for (const [label, diff, reason] of diffCases) {
      for (const via of ['draft-run', 'save'] as const) {
        const res2 =
          via === 'draft-run'
            ? await postDraftRun({ finding_id: ids.hunk2, input_diff: diff, expectation: goodLoc })
            : await postCase({ finding_id: ids.hunk2, name: 'n', input_diff: diff, expectation: goodLoc });
        const b = await json(res2);
        expect(res2.statusCode, `${label} via ${via}`).toBe(422);
        expect(b.error.code, `${label} via ${via}`).toBe('eval_invalid_diff');
        expect(b.error.details.reason, `${label} via ${via}`).toBe(reason);
      }
    }

    const expectationCases: Array<[string, { file: string; start_line: number; end_line: number }, string]> = [
      ['empty file', { file: '', start_line: 43, end_line: 43 }, 'file_empty'],
      ['another file', { file: 'src/other.ts', start_line: 43, end_line: 43 }, 'file_mismatch'],
      ['line 0', { file: FILE, start_line: 0, end_line: 43 }, 'line_not_positive_integer'],
      ['start after end', { file: FILE, start_line: 44, end_line: 43 }, 'start_after_end'],
      ['off every hunk', { file: FILE, start_line: 20, end_line: 20 }, 'outside_hunks'],
    ];
    for (const [label, expectation, reason] of expectationCases) {
      for (const via of ['draft-run', 'save'] as const) {
        const res2 =
          via === 'draft-run'
            ? await postDraftRun({ finding_id: ids.hunk2, input_diff: d2.input_diff, expectation })
            : await postCase({ finding_id: ids.hunk2, name: 'n', input_diff: d2.input_diff, expectation });
        const b = await json(res2);
        expect(res2.statusCode, `${label} via ${via}`).toBe(422);
        expect(b.error.code, `${label} via ${via}`).toBe('eval_invalid_expectation');
        expect(b.error.details.reason, `${label} via ${via}`).toBe(reason);
      }
    }

    const noName = await postCase({
      finding_id: ids.hunk2,
      name: '   ',
      input_diff: d2.input_diff,
      expectation: goodLoc,
    });
    expect(noName.statusCode).toBe(422);
    expect((await json(noName)).error.code).toBe('eval_invalid_name');

    // Rejected before any provider call, nothing written.
    expect(llm.structuredCalls).toBe(callsMid);
    expect(await counts()).toEqual(before);
  });

  // ------------------------------------------------------------------- save

  it('save: both types, server-owned fields, type-changed guard, duplicate guard, existing draft', async () => {
    const d2 = (await getDraft(ids.hunk2)).body.draft as Draft;

    // The request carries fields that must be ignored (11a, A-13).
    const created = await postCase({
      finding_id: ids.hunk2,
      name: '  Hunk two case  ',
      input_diff: d2.input_diff,
      expectation: loc(d2),
      displayed_type: 'must_find',
      severity: 'SUGGESTION',
      category: 'style',
      title: 'attacker title',
      owner_id: RANDOM_UUID,
      type: 'must_not_flag',
    });
    expect(created.statusCode).toBe(201);
    const c1 = await json(created);
    expect(c1.name).toBe('Hunk two case');
    expect(c1.agent_id).toBe(generalId);
    expect(c1.source_finding_id).toBe(ids.hunk2);
    expect(c1.expectation).toMatchObject({
      type: 'must_find',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hunk two finding',
      file: FILE,
      start_line: 43,
      end_line: 43,
    });
    expect(c1.last_result).toBeNull();
    saved.hunk2 = c1 as never;

    // Wrong displayed type: the decision changed while the form was open (27).
    const dSpan = (await getDraft(ids.span)).body.draft as Draft;
    const wrong = await postCase({
      finding_id: ids.span,
      name: 'Span',
      input_diff: dSpan.input_diff,
      expectation: loc(dSpan),
      displayed_type: 'must_find',
    });
    expect(wrong.statusCode).toBe(409);
    expect((await json(wrong)).error.code).toBe('eval_expectation_type_changed');

    const span = await postCase({
      finding_id: ids.span,
      name: 'Spanning case',
      input_diff: dSpan.input_diff,
      expectation: loc(dSpan),
      displayed_type: 'must_not_flag',
    });
    expect(span.statusCode).toBe(201);
    const c2 = await json(span);
    expect(c2.expectation.type).toBe('must_not_flag');
    saved.span = c2 as never;

    // Duplicate save (28): own code + the existing case id.
    const dup = await postCase({
      finding_id: ids.hunk2,
      name: 'again',
      input_diff: d2.input_diff,
      expectation: loc(d2),
    });
    expect(dup.statusCode).toBe(409);
    const dupBody = await json(dup);
    expect(dupBody.error.code).toBe('eval_case_exists');
    expect(dupBody.error.details.case_id).toBe(c1.id);

    // The draft for a saved finding is now the existing case (A-9, A-21).
    const again = await getDraft(ids.hunk2);
    expect(again.body.kind).toBe('existing');
    expect(again.body.case.id).toBe(c1.id);

    // Two concurrent saves for the same finding: onConflictDoNothing lets exactly one win.
    const dLast = (await getDraft(ids.last)).body.draft as Draft;
    const payload = {
      finding_id: ids.last,
      name: 'Last line case',
      input_diff: dLast.input_diff,
      expectation: loc(dLast),
      displayed_type: 'must_find',
    };
    const [r1, r2] = await Promise.all([postCase(payload), postCase(payload)]);
    const statuses = [r1.statusCode, r2.statusCode].sort();
    expect(statuses).toEqual([201, 409]);
    const loser = r1.statusCode === 409 ? r1 : r2;
    const winner = r1.statusCode === 201 ? r1 : r2;
    const winnerBody = await json(winner);
    const loserBody = await json(loser);
    expect(loserBody.error.code).toBe('eval_case_exists');
    expect(loserBody.error.details.case_id).toBe(winnerBody.id);
    saved.last = winnerBody as never;
    const rows = await pg.handle.db
      .select()
      .from(t.evalCases)
      .where(eq(t.evalCases.sourceFindingId, ids.last));
    expect(rows).toHaveLength(1);

    // The relocated full-file case, expectation moved into hunk 2.
    const dFull = (await getDraft(ids.fullFile)).body.draft as Draft;
    const full = await postCase({
      finding_id: ids.fullFile,
      name: 'Full file case',
      input_diff: dFull.input_diff,
      expectation: { file: FILE, start_line: 43, end_line: 43 },
      displayed_type: 'must_find',
    });
    expect(full.statusCode).toBe(201);
    saved.fullFile = (await json(full)) as never;

    // Edit through PUT keeps the stored reference fields.
    const put = await app.inject({
      method: 'PUT',
      url: `/eval-cases/${saved.last!.id}`,
      payload: {
        name: 'Last line case (renamed)',
        input_diff: dLast.input_diff,
        expectation: loc(dLast),
        severity: 'SUGGESTION',
      },
    });
    expect(put.statusCode).toBe(200);
    const putBody = await json(put);
    expect(putBody.name).toBe('Last line case (renamed)');
    expect(putBody.expectation.severity).toBe('CRITICAL');
    const get = await app.inject({ method: 'GET', url: `/eval-cases/${saved.last!.id}` });
    expect(get.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/eval-cases/${RANDOM_UUID}` })).statusCode).toBe(404);

    // Unknown agent: 404 on list / history / start.
    expect((await app.inject({ method: 'GET', url: `/agents/${RANDOM_UUID}/eval-cases` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/agents/${RANDOM_UUID}/eval-runs` })).statusCode).toBe(404);
    expect((await startRun(RANDOM_UUID)).status).toBe(404);

    const list = await json(await app.inject({ method: 'GET', url: `/agents/${generalId}/eval-cases` }));
    expect(list.cases_total).toBe(4);
    expect(list.cases_passing).toBe(0);
    expect(list.cases.every((c: { last_result: unknown }) => c.last_result === null)).toBe(true);
    expect(list.cases[0]).not.toHaveProperty('input_diff');
  });

  // ---------------------------------------------------------------- set run

  let runA: Json;
  let runB: Json;
  let runCId = '';

  it('set run: 202, reused while running, one call per case, nothing else written, last_result and parity', async () => {
    const before = await counts();
    const callsBefore = llm.structuredCalls;

    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    llm.handler = async () => {
      await gate;
      return { findings: [{ start: 43, end: 43 }] };
    };

    const first = await startRun(generalId);
    expect(first.status).toBe(202);
    expect(first.body.reused).toBe(false);
    expect(first.body.run.status).toBe('running');
    expect(first.body.run.version_label).toMatch(/^v\d+$/);

    const second = await startRun(generalId);
    expect(second.status).toBe(202);
    expect(second.body.reused).toBe(true);
    expect(second.body.run.id).toBe(first.body.run.id);

    const history = await json(await app.inject({ method: 'GET', url: `/agents/${generalId}/eval-runs` }));
    expect(history.active_run.id).toBe(first.body.run.id);
    expect(history.cases_total).toBe(4);

    release();
    runA = await waitRun(first.body.run.id);
    llm.handler = () => ({ findings: [{ start: 43, end: 43 }] });

    expect(runA.status).toBe('completed');
    expect(llm.structuredCalls - callsBefore).toBe(4);
    expect(runA.cases_total).toBe(4);
    expect(runA.cases_done).toBe(4);
    expect(runA.results).toHaveLength(4);
    expect(runA.cost_usd).toBeGreaterThan(0);
    const after = await counts();
    expect(untouched(after)).toEqual(untouched(before)); // A-45, A-2a
    expect(after.eval_runs).toBe(before.eval_runs);
    expect(after.eval_set_runs).toBe(before.eval_set_runs + 1);

    // Scripted output: one finding on line 43 for every case.
    const byCase = new Map<string, Json>((runA.results as Json[]).map((r) => [r.case_id as string, r]));
    expect(byCase.get(saved.hunk2!.id)!.status).toBe('passed');
    expect(byCase.get(saved.span!.id)!.status).toBe('failed'); // must_not_flag 5..43 overlaps 43
    expect(byCase.get(saved.last!.id)!.status).toBe('failed'); // must_find 45, got 43
    expect(byCase.get(saved.fullFile!.id)!.status).toBe('passed');
    expect(runA.cases_passed).toBe(2);

    // A-46 parity: the earlier draft run of the same case with the same output.
    expect(byCase.get(saved.hunk2!.id)!.status).toBe(draftRunByFinding[ids.hunk2]!.status);
    expect(byCase.get(saved.hunk2!.id)!.matched).toBe(draftRunByFinding[ids.hunk2]!.matched);
    expect(byCase.get(saved.span!.id)!.status).toBe(draftRunByFinding[ids.span]!.status);
    expect(byCase.get(saved.span!.id)!.matched).toBe(draftRunByFinding[ids.span]!.matched);

    const list = await json(await app.inject({ method: 'GET', url: `/agents/${generalId}/eval-cases` }));
    expect(list.cases_passing).toBe(2);
    const row = list.cases.find((c: { id: string }) => c.id === saved.hunk2!.id);
    expect(row.last_result).toMatchObject({ run_id: runA.id, status: 'passed' });
  });

  it('set run: a throwing case is errored, the run completes, cost is null; a failed run never replaces the last result', async () => {
    const callsBefore = llm.structuredCalls;
    llm.handler = (_m, index) => {
      if (index === callsBefore + 1) throw new Error('provider exploded');
      return { findings: [{ start: 43, end: 43 }] };
    };
    const started = await startRun(generalId);
    expect(started.body.reused).toBe(false);
    runB = await waitRun(started.body.run.id);
    expect(runB.status).toBe('completed');
    expect(runB.cases_errored).toBe(1);
    expect(runB.cases_total).toBe(4);
    expect(runB.cost_usd).toBeNull();
    const errored = runB.results.filter((r: { status: string }) => r.status === 'errored');
    expect(errored).toHaveLength(1);
    expect(errored[0].error).toContain('provider exploded');
    // cases_passed counts only passed cases out of cases_total.
    expect(runB.cases_passed).toBe(runB.results.filter((r: { status: string }) => r.status === 'passed').length);

    // Every case failing: the run fails and carries no metrics.
    llm.handler = () => {
      throw new Error('everything is down');
    };
    const failedStart = await startRun(generalId);
    const runC = await waitRun(failedStart.body.run.id);
    runCId = runC.id;
    expect(runC.status).toBe('failed');
    expect(runC.recall).toBeNull();
    expect(runC.error).toBeTruthy();
    llm.handler = () => ({ findings: [{ start: 43, end: 43 }] });

    // R-9: the case list still reflects the newest COMPLETED run (B), not the failed C.
    const list = await json(await app.inject({ method: 'GET', url: `/agents/${generalId}/eval-cases` }));
    for (const c of list.cases) expect(c.last_result.run_id).toBe(runB.id);
    const history = await json(await app.inject({ method: 'GET', url: `/agents/${generalId}/eval-runs` }));
    expect(history.active_run).toBeNull();
    expect(history.latest_completed.id).toBe(runB.id);
    expect(history.previous_completed.id).toBe(runA.id);
    expect(history.runs.map((r: { id: string }) => r.id)).toEqual([runCId, runB.id, runA.id]);
    expect(history.delta).not.toBeNull();
  });

  it('set run: an empty set is refused; concurrent starts yield exactly one running row', async () => {
    const emptyAgent = await createAgent('Empty Set Agent', 'nothing saved');
    const { agentId: concurrentAgent } = await agentWithCase('Concurrent Agent', 'concurrent');
    const empty = await startRun(emptyAgent);
    expect(empty.status).toBe(409);
    expect(empty.body.error.code).toBe('eval_set_empty');

    // Partial unique index: two simultaneous starts, one run.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    llm.handler = async () => {
      await gate;
      return { findings: [{ start: 43, end: 43 }] };
    };
    const [x, y] = await Promise.all([startRun(concurrentAgent), startRun(concurrentAgent)]);
    expect([x.status, y.status]).toEqual([202, 202]);
    expect(x.body.run.id).toBe(y.body.run.id);
    expect([x.body.reused, y.body.reused].sort()).toEqual([false, true]);
    const running = await pg.handle.db
      .select()
      .from(t.evalSetRuns)
      .where(eq(t.evalSetRuns.agentId, concurrentAgent));
    expect(running.filter((r) => r.status === 'running')).toHaveLength(1);

    // The repository reports the conflict as null rather than throwing.
    const repo = new EvalRepository(pg.handle.db);
    const dup = await repo.insertRunningRun({
      workspaceId,
      agentId: concurrentAgent,
      agentVersion: 1,
      provider: 'openai',
      model: 'm',
      strategy: 'single-pass',
      systemPrompt: 'p',
      skills: [],
      cases: [],
      casesTotal: 0,
    });
    expect(dup).toBeNull();

    release();
    await waitRun(x.body.run.id);
    llm.handler = () => ({ findings: [{ start: 43, end: 43 }] });
  });

  // ------------------------------------------------------ prompt + compare

  it('prompt sensitivity and compare: a new prompt changes the version and the metric; compare orders base older', async () => {
    const { agentId, caseId } = await agentWithCase('Prompt Sensitive', 'PROMPT_ALPHA reviewer');

    llm.handler = (messages) => {
      const text = messages.map((m) => m.content).join('\n');
      return text.includes('PROMPT_ALPHA')
        ? { findings: [{ start: 43, end: 43 }] }
        : { findings: [{ start: 41, end: 41 }] };
    };

    const r1 = await waitRun((await startRun(agentId)).body.run.id);
    const put = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}`,
      payload: { system_prompt: 'PROMPT_BETA reviewer' },
    });
    expect(put.statusCode).toBe(200);
    const r2 = await waitRun((await startRun(agentId)).body.run.id);
    llm.handler = () => ({ findings: [{ start: 43, end: 43 }] });

    expect(r1.status).toBe('completed');
    expect(r2.status).toBe('completed');
    expect(r1.version_label).not.toBe(r2.version_label);
    expect(r1.recall).toBe(1);
    expect(r2.recall).toBe(0);
    expect(r1.system_prompt).toContain('PROMPT_ALPHA');
    expect(r2.system_prompt).toContain('PROMPT_BETA');

    for (const [a, b] of [
      [r1.id, r2.id],
      [r2.id, r1.id],
    ] as const) {
      const res = await app.inject({ method: 'GET', url: `/eval-runs/compare?base=${a}&head=${b}` });
      expect(res.statusCode).toBe(200);
      const cmp = await json(res);
      expect(cmp.base.id).toBe(r1.id); // base = older whatever the parameter order
      expect(cmp.head.id).toBe(r2.id);
      expect(cmp.prompt_changed).toBe(true);
      expect(cmp.delta.recall).toBe(-1);
      expect(cmp.comparable).toBe(true);
    }

    // A-33a: a random id is a 404, checked before comparability.
    const missing = await app.inject({
      method: 'GET',
      url: `/eval-runs/compare?base=${r1.id}&head=${RANDOM_UUID}`,
    });
    expect(missing.statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/eval-runs/${RANDOM_UUID}` })).statusCode).toBe(404);

    // A-33: two agents -> different_agents; a failed run -> not_completed.
    const cross = await app.inject({ method: 'GET', url: `/eval-runs/compare?base=${runA.id}&head=${r1.id}` });
    expect(cross.statusCode).toBe(409);
    const crossBody = await json(cross);
    expect(crossBody.error.code).toBe('eval_compare_invalid');
    expect(crossBody.error.details.reason).toBe('different_agents');

    const failed = await app.inject({ method: 'GET', url: `/eval-runs/compare?base=${runA.id}&head=${runCId}` });
    expect(failed.statusCode).toBe(409);
    const failedBody = await json(failed);
    expect(failedBody.error.code).toBe('eval_compare_invalid');
    expect(failedBody.error.details.reason).toBe('not_completed');

    // Dashboard shows both agents with their latest completed run.
    const dash = await json(await app.inject({ method: 'GET', url: '/eval/dashboard' }));
    const row = dash.agents.find((a: { agent: { id: string } }) => a.agent.id === agentId);
    expect(row.cases_total).toBe(1);
    expect(row.latest_completed.id).toBe(r2.id);

    // Delete the case: gone, and the set is empty again.
    const del = await app.inject({ method: 'DELETE', url: `/eval-cases/${caseId}` });
    expect(del.statusCode).toBe(200);
    expect((await json(del)).ok).toBe(true);
    expect((await app.inject({ method: 'GET', url: `/eval-cases/${caseId}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${caseId}` })).statusCode).toBe(404);
  });
});
