import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { makeRepoIntelStub } from './helpers/repo-intel-stub.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * DB-backed coverage for `POST /repos/:id/conventions/skill`: accepted-only
 * rendering, upsert-by-name + version bump on rebuild, and agent linking via
 * `linkSkill` (never `setSkills`, which would unlink every other skill on
 * that agent — server/specs/L02-conventions-extractor.api.md).
 */
d('conventions → repo-conventions skill build (DB-backed)', () => {
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
      overrides: { git: new MockGitClient(), github: new MockGitHubClient(), repoIntel: makeRepoIntelStub() },
    });
  }

  async function makeRepo(name: string) {
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    return repo!;
  }

  async function insertAccepted(repoId: string, rule: string, path = 'src/a.ts') {
    const [row] = await pg.handle.db
      .insert(t.conventions)
      .values({
        workspaceId,
        repoId,
        category: 'naming',
        rule,
        evidencePath: path,
        evidenceLine: 1,
        evidenceSnippet: 'x',
        evidenceSha: 'sha1',
        evidences: [{ path, line: 1, snippet: 'x', sha: 'sha1' }],
        confidence: 0.8,
        status: 'accepted',
      })
      .returning();
    return row!;
  }

  it('builds a repo-conventions skill (type convention, source extracted) from accepted candidates only', async () => {
    const app = await makeApp();
    const repo = await makeRepo('skill-build');
    await insertAccepted(repo.id, 'Use camelCase');
    await pg.handle.db.insert(t.conventions).values({
      workspaceId,
      repoId: repo.id,
      category: 'testing',
      rule: 'Never assert on mocks',
      status: 'rejected', // must NOT appear in the body
      confidence: 0.5,
    });

    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/skill`, payload: {} });
    expect(res.statusCode).toBe(200);
    const skill = res.json();
    expect(skill.name).toBe('repo-conventions');
    expect(skill.type).toBe('convention');
    expect(skill.source).toBe('extracted');
    expect(skill.version).toBe(1);
    expect(skill.body).toContain('Use camelCase');
    expect(skill.body).not.toContain('Never assert on mocks');

    const [row] = await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, skill.id));
    expect(row!.workspaceId).toBe(workspaceId);

    await app.close();
  });

  it('rebuilding upserts by name and bumps the version', async () => {
    // Own workspace: `repo-conventions` is upserted BY NAME within a
    // workspace (server/specs/L02-conventions-extractor.api.md), so a repo
    // sharing a workspace with an earlier test's skill would otherwise
    // collide with this test's fresh version-1 assertion.
    const [ws] = await pg.handle.db.insert(t.workspaces).values({ name: 'Rebuild workspace' }).returning();
    const rebuildWorkspaceId = ws!.id;
    const app = await makeApp();
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: rebuildWorkspaceId, owner: 'acme', name: 'skill-rebuild', fullName: 'acme/skill-rebuild' })
      .returning();

    async function insertAcceptedIn(rule: string, path: string) {
      await pg.handle.db.insert(t.conventions).values({
        workspaceId: rebuildWorkspaceId,
        repoId: repo!.id,
        category: 'naming',
        rule,
        evidencePath: path,
        evidenceLine: 1,
        evidenceSnippet: 'x',
        evidenceSha: 'sha1',
        evidences: [{ path, line: 1, snippet: 'x', sha: 'sha1' }],
        confidence: 0.8,
        status: 'accepted',
      });
    }

    await insertAcceptedIn('Rule one', 'src/a.ts');

    // `LocalNoAuthProvider` resolves every `app.inject()` request to the
    // exact-name-matched DEFAULT workspace (server/INSIGHTS.md, 2026-09-21),
    // not whichever workspace this test cares about — exercise the service
    // directly against this workspace instead of going through HTTP.
    const { ConventionsService } = await import('../src/modules/conventions/service.js');
    const service = new ConventionsService(app.container);

    const first = await service.buildSkill(rebuildWorkspaceId, repo!.id);
    expect(first.version).toBe(1);

    await insertAcceptedIn('Rule two', 'src/b.ts');
    const second = await service.buildSkill(rebuildWorkspaceId, repo!.id);
    expect(second.id).toBe(first.id); // same skill, upserted
    expect(second.version).toBe(2);
    expect(second.body).toContain('Rule one');
    expect(second.body).toContain('Rule two');

    const skills = await pg.handle.db.select().from(t.skills).where(eq(t.skills.workspaceId, rebuildWorkspaceId));
    expect(skills.filter((s) => s.name === 'repo-conventions')).toHaveLength(1); // no duplicate row

    await app.close();
  });

  it('linking to an agent preserves that agent\'s existing linked skills', async () => {
    const app = await makeApp();
    const repo = await makeRepo('skill-link');
    await insertAccepted(repo.id, 'Rule one');

    const otherSkill = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: 'Other skill', description: 'd', type: 'custom', source: 'manual', body: 'x' },
      })
    ).json();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Linker agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    await pg.handle.db.insert(t.agentSkills).values({ agentId: agent.id, skillId: otherSkill.id, order: 0 });

    const built = (
      await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/skill`, payload: { agent_id: agent.id } })
    ).json();

    const links = await pg.handle.db.select().from(t.agentSkills).where(eq(t.agentSkills.agentId, agent.id));
    const linkedIds = links.map((l) => l.skillId).sort();
    expect(linkedIds).toEqual([built.id, otherSkill.id].sort());

    await app.close();
  });

  it('a repo from another workspace 404s', async () => {
    const app = await makeApp();
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'Other ws' }).returning();
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: otherWs!.id, owner: 'acme', name: 'foreign-skill', fullName: 'acme/foreign-skill' })
      .returning();

    const res = await app.inject({ method: 'POST', url: `/repos/${repo!.id}/conventions/skill`, payload: {} });
    expect(res.statusCode).toBe(404);

    await app.close();
  });
});
