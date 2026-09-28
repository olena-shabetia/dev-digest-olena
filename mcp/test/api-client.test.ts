import { describe, it, expect } from 'vitest';
import { DevDigestApi } from '../src/api/client.js';
import { ApiHttpError, ApiUnreachableError, ToolError } from '../src/errors.js';
import { createFakeFetch, jsonResponse } from './helpers/fake-fetch.js';
import { REPO_ID, PR_ID, repoFixture, prFixture } from './helpers/fixtures.js';

function makeApi(fetchImpl: typeof fetch): DevDigestApi {
  return new DevDigestApi({ baseUrl: 'http://localhost:3001', timeoutMs: 1000, fetchImpl });
}

describe('DevDigestApi', () => {
  it('parses a successful list response with the shared contract', async () => {
    const { fetchImpl } = createFakeFetch({
      'GET /repos': () => jsonResponse([repoFixture()]),
    });
    const api = makeApi(fetchImpl);

    const repos = await api.listRepos();
    expect(repos).toHaveLength(1);
    expect(repos[0]?.full_name).toBe('acme/payments-api');
  });

  it('converts a 404 with the API error envelope into ApiHttpError', async () => {
    const { fetchImpl } = createFakeFetch({
      'GET /repos/:id/pulls': () =>
        jsonResponse({ error: { code: 'not_found', message: 'Repo not found' } }, { status: 404 }),
    });
    const api = makeApi(fetchImpl);

    await expect(api.listPulls(REPO_ID)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'Repo not found',
    } satisfies Partial<ApiHttpError>);
  });

  it('wraps a rejected fetch (network failure) in ApiUnreachableError naming the base URL', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const api = makeApi(fetchImpl);

    await expect(api.listRepos()).rejects.toBeInstanceOf(ApiUnreachableError);
    try {
      await api.listRepos();
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiUnreachableError);
      expect((e as ApiUnreachableError).apiBase).toBe('http://localhost:3001');
    }
  });

  it('surfaces HTTP 429 responses as ApiHttpError with status 429', async () => {
    const { fetchImpl } = createFakeFetch({
      'POST /pulls/:id/review': () =>
        jsonResponse(
          { error: { code: 'rate_limited', message: 'Too many requests' } },
          { status: 429 },
        ),
    });
    const api = makeApi(fetchImpl);

    await expect(api.startReview(PR_ID, 'agent-1')).rejects.toMatchObject({ status: 429 });
  });

  it('rejects a response that fails the shared schema with a ToolError(unexpected_shape)', async () => {
    const { fetchImpl } = createFakeFetch({
      'GET /repos': () => jsonResponse([{ id: 'x' }]), // missing required Repo fields
    });
    const api = makeApi(fetchImpl);

    await expect(api.listRepos()).rejects.toBeInstanceOf(ToolError);
    try {
      await api.listRepos();
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ToolError);
      expect((e as ToolError).code).toBe('unexpected_shape');
      expect((e as ToolError).message).toContain('GET /repos');
    }
  });

  it('sends a JSON content-type body for startReview and exercises the doubled-timeout listPulls path', async () => {
    const { fetchImpl, calls } = createFakeFetch({
      'POST /pulls/:id/review': () => jsonResponse({ pr_id: PR_ID, runs: [], reviews: [] }),
      'GET /repos/:id/pulls': () => jsonResponse([prFixture()]),
    });
    const api = makeApi(fetchImpl);

    await api.startReview(PR_ID, 'agent-1');
    const reviewCall = calls.find((c) => c.method === 'POST');
    expect(reviewCall?.body).toEqual({ agentId: 'agent-1' });

    const pulls = await api.listPulls(REPO_ID);
    expect(pulls).toHaveLength(1);
    expect(calls.some((c) => c.path === `/repos/${REPO_ID}/pulls`)).toBe(true);
  });
});
