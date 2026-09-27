import { describe, it, expect } from 'vitest';
import { DevDigestApi } from '../src/api/client.js';
import { Resolver, normalizeRepoArg } from '../src/resolve.js';
import { ToolError } from '../src/errors.js';
import { createFakeFetch, jsonResponse } from './helpers/fake-fetch.js';
import { REPO_ID, repoFixture, prFixture, agentFixture } from './helpers/fixtures.js';

function makeApi(fetchImpl: typeof fetch): DevDigestApi {
  return new DevDigestApi({ baseUrl: 'http://localhost:3001', timeoutMs: 1000, fetchImpl });
}

describe('normalizeRepoArg', () => {
  it('strips the github.com prefix, a .git suffix, and lowercases for comparison', () => {
    expect(normalizeRepoArg('acme/payments-api')).toBe('acme/payments-api');
    expect(normalizeRepoArg('https://github.com/Acme/Payments-API')).toBe('acme/payments-api');
    expect(normalizeRepoArg('https://github.com/Acme/Payments-API.git')).toBe('acme/payments-api');
    expect(normalizeRepoArg('  Acme/Payments-API/  ')).toBe('acme/payments-api');
  });
});

describe('Resolver.resolveRepo', () => {
  it('matches full_name case-insensitively and tolerant of a github.com URL', async () => {
    const { fetchImpl } = createFakeFetch({
      'GET /repos': () => jsonResponse([repoFixture()]),
    });
    const resolver = new Resolver(makeApi(fetchImpl));

    const match = await resolver.resolveRepo('https://github.com/ACME/Payments-API.git');
    expect(match).toEqual({ id: REPO_ID, fullName: 'acme/payments-api' });
  });

  it('throws repo_not_found listing up to 5 known repos', async () => {
    const { fetchImpl } = createFakeFetch({
      'GET /repos': () => jsonResponse([repoFixture()]),
    });
    const resolver = new Resolver(makeApi(fetchImpl));

    await expect(resolver.resolveRepo('acme/unknown')).rejects.toMatchObject({
      code: 'repo_not_found',
    } satisfies Partial<ToolError>);
    try {
      await resolver.resolveRepo('acme/unknown');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ToolError);
      expect((e as ToolError).message).toContain('acme/payments-api');
    }
  });
});

describe('Resolver.resolvePull', () => {
  it('caches listPulls per repo — two resolvePull calls make exactly one fetch', async () => {
    const { fetchImpl, callCount } = createFakeFetch({
      'GET /repos': () => jsonResponse([repoFixture()]),
      'GET /repos/:id/pulls': () => jsonResponse([prFixture()]),
    });
    const resolver = new Resolver(makeApi(fetchImpl));

    const first = await resolver.resolvePull('acme/payments-api', 482);
    const second = await resolver.resolvePull('acme/payments-api', 482);

    expect(first).toEqual(second);
    expect(callCount(`GET /repos/${REPO_ID}/pulls`)).toBe(1);
  });

  it('refetches once on a cache miss before giving up with pr_not_imported', async () => {
    const { fetchImpl, callCount } = createFakeFetch({
      'GET /repos': () => jsonResponse([repoFixture()]),
      'GET /repos/:id/pulls': () => jsonResponse([prFixture()]),
    });
    const resolver = new Resolver(makeApi(fetchImpl));

    await expect(resolver.resolvePull('acme/payments-api', 999)).rejects.toMatchObject({
      code: 'pr_not_imported',
    } satisfies Partial<ToolError>);
    // One initial fetch (cache miss) + one forced refetch before failing.
    expect(callCount(`GET /repos/${REPO_ID}/pulls`)).toBe(2);
  });

  it('skips PrMeta rows with a nullish id', async () => {
    const { fetchImpl } = createFakeFetch({
      'GET /repos': () => jsonResponse([repoFixture()]),
      'GET /repos/:id/pulls': () => jsonResponse([prFixture({ id: null, number: 482 })]),
    });
    const resolver = new Resolver(makeApi(fetchImpl));

    await expect(resolver.resolvePull('acme/payments-api', 482)).rejects.toMatchObject({
      code: 'pr_not_imported',
    } satisfies Partial<ToolError>);
  });
});

describe('Resolver.resolveAgent', () => {
  it('matches by exact id', async () => {
    const { fetchImpl } = createFakeFetch({
      'GET /agents': () => jsonResponse([agentFixture()]),
    });
    const resolver = new Resolver(makeApi(fetchImpl));

    const agent = await resolver.resolveAgent(agentFixture().id);
    expect(agent.name).toBe('Security Reviewer');
  });

  it('matches by exact name case-insensitively', async () => {
    const { fetchImpl } = createFakeFetch({
      'GET /agents': () => jsonResponse([agentFixture()]),
    });
    const resolver = new Resolver(makeApi(fetchImpl));

    const agent = await resolver.resolveAgent('security reviewer');
    expect(agent.id).toBe(agentFixture().id);
  });

  it('matches a unique substring', async () => {
    const { fetchImpl } = createFakeFetch({
      'GET /agents': () => jsonResponse([agentFixture()]),
    });
    const resolver = new Resolver(makeApi(fetchImpl));

    const agent = await resolver.resolveAgent('security');
    expect(agent.name).toBe('Security Reviewer');
  });

  it('throws agent_ambiguous when a substring matches more than one agent', async () => {
    const { fetchImpl } = createFakeFetch({
      'GET /agents': () =>
        jsonResponse([
          agentFixture({ id: 'a1', name: 'Security Reviewer' }),
          agentFixture({ id: 'a2', name: 'General Security' }),
        ]),
    });
    const resolver = new Resolver(makeApi(fetchImpl));

    await expect(resolver.resolveAgent('security')).rejects.toMatchObject({
      code: 'agent_ambiguous',
    } satisfies Partial<ToolError>);
  });

  it('throws agent_not_found when nothing matches', async () => {
    const { fetchImpl } = createFakeFetch({
      'GET /agents': () => jsonResponse([agentFixture()]),
    });
    const resolver = new Resolver(makeApi(fetchImpl));

    await expect(resolver.resolveAgent('nonexistent')).rejects.toMatchObject({
      code: 'agent_not_found',
    } satisfies Partial<ToolError>);
  });
});
