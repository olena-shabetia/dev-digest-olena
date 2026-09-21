import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * DB-backed coverage for the skills module (server/src/modules/skills/**):
 * CRUD, workspace scoping, the body-change version-bump rule, the
 * skill_versions/agent_skills cascade on delete, versions ordering, stats, and
 * the import-preview route's md/zip round trip. Mirrors the setup pattern in
 * `routes-response.it.test.ts:274-312` (raw `t.skills`/`t.agents` inserts +
 * `app.inject()`), a lighter harness than the full review-pipeline suites
 * since none of this needs an LLM or a real PR.
 */
d('skills module (DB-backed)', () => {
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
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  // Every request in this suite goes through LocalNoAuthProvider, which
  // resolves to the FIRST workspace row it finds — inserting one workspace up
  // front (above) and asserting against it keeps every test in this file
  // scoped to that same tenant.
  async function otherWorkspaceId(): Promise<string> {
    const [ws] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: 'Other workspace' })
      .returning();
    return ws!.id;
  }

  it('full CRUD: create, get, list, update (no version bump), delete', async () => {
    const app = await makeApp();

    const created = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: {
          name: 'No secrets',
          description: 'Never commit a live key.',
          type: 'security',
          source: 'manual',
          body: 'Flag any hardcoded secret.',
        },
      })
    ).json();
    expect(created.version).toBe(1);
    expect(created.enabled).toBe(true);
    expect(created).not.toHaveProperty('created_at');
    expect(created).not.toHaveProperty('createdAt');

    const got = await app.inject({ method: 'GET', url: `/skills/${created.id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json().id).toBe(created.id);

    const [row] = await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, created.id));
    expect(row!.workspaceId).toBe(workspaceId);

    const list = await app.inject({ method: 'GET', url: '/skills' });
    expect(list.statusCode).toBe(200);
    expect(list.json().some((s: { id: string }) => s.id === created.id)).toBe(true);

    // Only name/enabled change — no version bump.
    const updated = (
      await app.inject({
        method: 'PUT',
        url: `/skills/${created.id}`,
        payload: { name: 'No secrets (renamed)', enabled: false },
      })
    ).json();
    expect(updated.version).toBe(1);
    expect(updated.name).toBe('No secrets (renamed)');
    expect(updated.enabled).toBe(false);

    const del = await app.inject({ method: 'DELETE', url: `/skills/${created.id}` });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ ok: true });

    const afterDelete = await app.inject({ method: 'GET', url: `/skills/${created.id}` });
    expect(afterDelete.statusCode).toBe(404);

    await app.close();
  });

  it('a skill from another workspace 404s', async () => {
    const app = await makeApp();
    const otherWs = await otherWorkspaceId();
    const [skill] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId: otherWs,
        name: 'Foreign skill',
        description: 'Not in this workspace.',
        type: 'custom',
        source: 'manual',
        body: 'x',
      })
      .returning();

    const res = await app.inject({ method: 'GET', url: `/skills/${skill!.id}` });
    expect(res.statusCode).toBe(404);

    const list = await app.inject({ method: 'GET', url: '/skills' });
    expect(list.json().some((s: { id: string }) => s.id === skill!.id)).toBe(false);

    await app.close();
  });

  it('a body edit bumps version and writes exactly one skill_versions row with the change_note', async () => {
    const app = await makeApp();
    const created = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: {
          name: 'Corner cases',
          description: 'Flag missing edge-case tests.',
          type: 'rubric',
          source: 'manual',
          body: 'v1 body',
        },
      })
    ).json();

    const updated = (
      await app.inject({
        method: 'PUT',
        url: `/skills/${created.id}`,
        payload: { body: 'v2 body', change_note: 'Tightened scope rule' },
      })
    ).json();
    expect(updated.version).toBe(2);
    expect(updated.body).toBe('v2 body');

    const versions = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, created.id));
    // v1 (from insert) + v2 (from this update) = exactly 2 rows total, and
    // exactly ONE new row was written by this update.
    expect(versions).toHaveLength(2);
    const v2 = versions.find((v) => v.version === 2)!;
    expect(v2.body).toBe('v2 body');
    expect(v2.changeNote).toBe('Tightened scope rule');

    await app.close();
  });

  it('editing only name/enabled does not bump version or write a new skill_versions row', async () => {
    const app = await makeApp();
    const created = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: {
          name: 'Mock overuse',
          description: 'Flag mock-only assertions.',
          type: 'convention',
          source: 'manual',
          body: 'v1 body',
        },
      })
    ).json();

    await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { name: 'Mock overuse (v2 name)', enabled: false },
    });

    const versions = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, created.id));
    expect(versions).toHaveLength(1);
    expect(versions[0]!.version).toBe(1);

    await app.close();
  });

  it('GET /skills/:id/versions returns newest first', async () => {
    const app = await makeApp();
    const created = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: {
          name: 'Versioned skill',
          description: 'd',
          type: 'custom',
          source: 'manual',
          body: 'v1',
        },
      })
    ).json();
    await app.inject({ method: 'PUT', url: `/skills/${created.id}`, payload: { body: 'v2' } });
    await app.inject({ method: 'PUT', url: `/skills/${created.id}`, payload: { body: 'v3' } });

    const res = await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` });
    expect(res.statusCode).toBe(200);
    const versions = res.json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    expect(versions[0].body).toBe('v3');

    await app.close();
  });

  it('deleting a skill cascades its skill_versions and agent_skills links', async () => {
    const app = await makeApp();
    const created = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: {
          name: 'To be deleted',
          description: 'd',
          type: 'custom',
          source: 'manual',
          body: 'v1',
        },
      })
    ).json();
    await app.inject({ method: 'PUT', url: `/skills/${created.id}`, payload: { body: 'v2' } });

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Linker', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    await pg.handle.db.insert(t.agentSkills).values({ agentId: agent.id, skillId: created.id, order: 0 });

    const del = await app.inject({ method: 'DELETE', url: `/skills/${created.id}` });
    expect(del.statusCode).toBe(200);

    const versions = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, created.id));
    expect(versions).toHaveLength(0);

    const links = await pg.handle.db
      .select()
      .from(t.agentSkills)
      .where(eq(t.agentSkills.skillId, created.id));
    expect(links).toHaveLength(0);

    await app.close();
  });

  it('GET /skills/:id/stats returns real agents_using with no fabricated fields', async () => {
    const app = await makeApp();
    const created = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: {
          name: 'Stats skill',
          description: 'd',
          type: 'custom',
          source: 'manual',
          body: 'body',
        },
      })
    ).json();

    const agentA = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Agent A', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    const agentB = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Agent B', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    await pg.handle.db
      .insert(t.agentSkills)
      .values([
        { agentId: agentA.id, skillId: created.id, order: 0 },
        { agentId: agentB.id, skillId: created.id, order: 0 },
      ]);

    const res = await app.inject({ method: 'GET', url: `/skills/${created.id}/stats` });
    expect(res.statusCode).toBe(200);
    const stats = res.json();
    expect(Object.keys(stats).sort()).toEqual(['agents_using', 'skill_id'].sort());
    expect(stats.skill_id).toBe(created.id);
    const names = stats.agents_using.map((a: { name: string }) => a.name).sort();
    expect(names).toEqual(['Agent A', 'Agent B']);

    await app.close();
  });

  it('import preview round-trips an in-memory .md file and does NOT write to the DB', async () => {
    const app = await makeApp();
    const before = (await app.inject({ method: 'GET', url: '/skills' })).json();

    const md = `# Corner cases

Flag missing edge-case tests.`;
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: buildMultipart('skill.md', Buffer.from(md, 'utf8'), 'text/markdown'),
      headers: multipartHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const preview = res.json();
    expect(preview.name).toBe('Corner cases');
    expect(preview.source_filename).toBe('skill.md');
    expect(preview.ignored_entries).toEqual([]);
    expect(preview.executable_entries).toEqual([]);

    const after = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(after.length).toBe(before.length);

    await app.close();
  });

  it('import preview round-trips an in-memory .zip and reports ignored/executable entries; does NOT write to the DB', async () => {
    const app = await makeApp();
    const before = (await app.inject({ method: 'GET', url: '/skills' })).json();

    const zipped = zipSync({
      'SKILL.md': strToU8('# API contract gate\n\nFlag breaking route changes.'),
      'install.sh': strToU8('# harmless comment, never executed'),
      'README.txt': strToU8('notes'),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: buildMultipart('skill.zip', Buffer.from(zipped), 'application/zip'),
      headers: multipartHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const preview = res.json();
    expect(preview.name).toBe('API contract gate');
    expect(preview.ignored_entries.sort()).toEqual(['install.sh', 'README.txt'].sort());
    expect(preview.executable_entries).toEqual(['install.sh']);

    const after = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(after.length).toBe(before.length);

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// Minimal multipart/form-data body builder for app.inject() — avoids pulling
// in a real HTTP client just to exercise one file-upload route.
// ---------------------------------------------------------------------------
const BOUNDARY = '----devdigestTestBoundary';

function multipartHeaders() {
  return { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` };
}

function buildMultipart(filename: string, content: Buffer, contentType: string): Buffer {
  const head = Buffer.from(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    'utf8',
  );
  const tail = Buffer.from(`\r\n--${BOUNDARY}--\r\n`, 'utf8');
  return Buffer.concat([head, content, tail]);
}
