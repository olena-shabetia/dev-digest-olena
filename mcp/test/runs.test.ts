import { describe, it, expect, vi } from 'vitest';
import { DevDigestApi } from '../src/api/client.js';
import { RunRegistry, waitForRun } from '../src/runs.js';
import { ApiUnreachableError } from '../src/errors.js';
import { createFakeFetch, jsonResponse } from './helpers/fake-fetch.js';
import { PR_ID, RUN_ID, AGENT_ID, runFixture } from './helpers/fixtures.js';

function makeApi(fetchImpl: typeof fetch): DevDigestApi {
  return new DevDigestApi({ baseUrl: 'http://localhost:3001', timeoutMs: 1000, fetchImpl });
}

/** A fake clock + no-op sleep so polling tests run instantly instead of
 *  waiting on real timers. `sleep` just advances the clock by `ms`. */
function fakeClock(startMs = 0) {
  let current = startMs;
  const now = () => current;
  const sleep = async (ms: number, signal?: AbortSignal): Promise<void> => {
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted', 'AbortError');
    }
    current += ms;
  };
  return { now, sleep };
}

describe('RunRegistry', () => {
  it('remembers and retrieves a run ref', () => {
    const registry = new RunRegistry();
    registry.remember({
      runId: RUN_ID,
      agentId: AGENT_ID,
      agentName: 'Security Reviewer',
      repoId: 'r1',
      repoFullName: 'acme/payments-api',
      prId: PR_ID,
      prNumber: 482,
    });

    expect(registry.get(RUN_ID)?.repoFullName).toBe('acme/payments-api');
    expect(registry.get('unknown-run')).toBeUndefined();
  });
});

describe('waitForRun', () => {
  it('resolves "done" once the polled run reaches status done', async () => {
    const { fetchImpl, callCount } = createFakeFetch({
      'GET /pulls/:id/runs': () => jsonResponse([runFixture({ status: 'done' })]),
    });
    const { now, sleep } = fakeClock();

    const outcome = await waitForRun(makeApi(fetchImpl), PR_ID, RUN_ID, {
      timeoutMs: 180_000,
      intervalMs: 4_000,
      now,
      sleep,
    });

    expect(outcome).toMatchObject({ kind: 'done' });
    expect(callCount(`GET /pulls/${PR_ID}/runs`)).toBe(1);
  });

  it('resolves "failed" with the run carrying the error message', async () => {
    const { fetchImpl } = createFakeFetch({
      'GET /pulls/:id/runs': () =>
        jsonResponse([runFixture({ status: 'failed', error: 'provider 401' })]),
    });
    const { now, sleep } = fakeClock();

    const outcome = await waitForRun(makeApi(fetchImpl), PR_ID, RUN_ID, {
      timeoutMs: 180_000,
      intervalMs: 4_000,
      now,
      sleep,
    });

    expect(outcome.kind).toBe('failed');
    if (outcome.kind === 'failed') {
      expect(outcome.run.error).toBe('provider 401');
    }
  });

  it('resolves "cancelled" when the run was cancelled', async () => {
    const { fetchImpl } = createFakeFetch({
      'GET /pulls/:id/runs': () => jsonResponse([runFixture({ status: 'cancelled' })]),
    });
    const { now, sleep } = fakeClock();

    const outcome = await waitForRun(makeApi(fetchImpl), PR_ID, RUN_ID, {
      timeoutMs: 180_000,
      intervalMs: 4_000,
      now,
      sleep,
    });

    expect(outcome.kind).toBe('cancelled');
  });

  it('times out at the deadline on a fake clock without any real delay', async () => {
    const { fetchImpl } = createFakeFetch({
      'GET /pulls/:id/runs': () => jsonResponse([runFixture({ status: 'running' })]),
    });
    const { now, sleep } = fakeClock();
    const onProgress = vi.fn();

    const outcome = await waitForRun(makeApi(fetchImpl), PR_ID, RUN_ID, {
      timeoutMs: 10_000,
      intervalMs: 4_000,
      now,
      sleep,
      onProgress,
    });

    expect(outcome.kind).toBe('timeout');
    if (outcome.kind === 'timeout') {
      expect(outcome.elapsedMs).toBeGreaterThanOrEqual(10_000);
    }
    expect(onProgress).toHaveBeenCalled();
  });

  it('backs off on HTTP 429 without treating it as an error', async () => {
    let calls = 0;
    const { fetchImpl } = createFakeFetch({
      'GET /pulls/:id/runs': () => {
        calls += 1;
        if (calls === 1) {
          return jsonResponse(
            { error: { code: 'rate_limited', message: 'slow down' } },
            { status: 429 },
          );
        }
        return jsonResponse([runFixture({ status: 'done' })]);
      },
    });
    const { now, sleep } = fakeClock();
    const sleepSpy = vi.fn(sleep);

    const outcome = await waitForRun(makeApi(fetchImpl), PR_ID, RUN_ID, {
      timeoutMs: 180_000,
      intervalMs: 4_000,
      now,
      sleep: sleepSpy,
    });

    expect(outcome.kind).toBe('done');
    expect(sleepSpy).toHaveBeenCalledWith(10_000, undefined);
  });

  it('retries an unreachable API up to twice, then rethrows', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const { now, sleep } = fakeClock();

    await expect(
      waitForRun(makeApi(fetchImpl), PR_ID, RUN_ID, {
        timeoutMs: 180_000,
        intervalMs: 4_000,
        now,
        sleep,
      }),
    ).rejects.toBeInstanceOf(ApiUnreachableError);
  });

  it('stops polling when the signal aborts, without cancelling the server-side run', async () => {
    const { fetchImpl, callCount } = createFakeFetch({
      'GET /pulls/:id/runs': () => jsonResponse([runFixture({ status: 'running' })]),
    });
    const controller = new AbortController();
    const { now, sleep } = fakeClock();
    const sleepThenAbort = async (ms: number, signal?: AbortSignal) => {
      controller.abort();
      await sleep(ms, signal);
    };

    const outcome = await waitForRun(makeApi(fetchImpl), PR_ID, RUN_ID, {
      timeoutMs: 180_000,
      intervalMs: 4_000,
      signal: controller.signal,
      now,
      sleep: sleepThenAbort,
    });

    expect(outcome.kind).toBe('timeout');
    expect(callCount(`GET /pulls/${PR_ID}/runs`)).toBe(1);
  });
});
