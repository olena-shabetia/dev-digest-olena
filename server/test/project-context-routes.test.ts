import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';

/**
 * No-DB route validation for the project-context module. Both cases below
 * are rejected before the service ever reaches `container.reviewRepo` (an
 * invalid uuid fails `IdParams` at the schema layer; an unsafe `path` fails
 * `isSafeDocPath` — pure, no I/O — before `ProjectContextService.file`
 * resolves the repo), so neither needs Postgres. DB-backed coverage
 * (a real repo lookup, the discovered-set check, usage counts) is a
 * `.it.test.ts` gap for test-writer (plan §7).
 */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

describe('project-context routes (no DB)', () => {
  it('GET /repos/:id/context with an invalid uuid → 422', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/repos/not-a-uuid/context' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  it('GET /repos/:id/context/file with an unsafe path → 422, before any DB read', async () => {
    const app = await buildApp({ config });
    const id = '11111111-1111-1111-1111-111111111111';
    const res = await app.inject({
      method: 'GET',
      url: `/repos/${id}/context/file?path=../x.md`,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });
});
