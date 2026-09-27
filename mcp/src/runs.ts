// In-process registry mapping a `run_id` back to the PR/agent that started
// it (D5 — there is no `GET /runs/:id` on the API), and the polling loop that
// waits for a run to leave `running` (D4 — polls `GET /pulls/:id/runs`
// instead of the in-memory SSE bus, which does not survive an API restart).
import type { RunSummary } from '@devdigest/shared';
import type { DevDigestApi } from './api/client.js';
import { ApiHttpError, ApiUnreachableError } from './errors.js';
import type { ResolvedPr } from './resolve.js';

export interface RunRef extends ResolvedPr {
  runId: string;
  agentId: string;
  agentName: string;
}

const MAX_REGISTRY_ENTRIES = 200;

/** FIFO-capped in-memory map; a fresh MCP process starts empty, so this only
 *  ever needs to survive the lifetime of one stdio session. */
export class RunRegistry {
  private readonly entries = new Map<string, RunRef>();

  remember(ref: RunRef): void {
    if (this.entries.has(ref.runId)) {
      this.entries.delete(ref.runId);
    } else if (this.entries.size >= MAX_REGISTRY_ENTRIES) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) this.entries.delete(oldestKey);
    }
    this.entries.set(ref.runId, ref);
  }

  get(runId: string): RunRef | undefined {
    return this.entries.get(runId);
  }
}

export type WaitOutcome =
  | { kind: 'done'; run: RunSummary }
  | { kind: 'failed' | 'cancelled'; run: RunSummary }
  | { kind: 'timeout'; elapsedMs: number };

const RATE_LIMIT_BACKOFF_MS = 10_000;
const MAX_UNREACHABLE_RETRIES = 2;

async function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('The operation was aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('The operation was aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

const ABORTED = Symbol('aborted');

function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

/** Sleeps, but turns an abort during the sleep into the `ABORTED` sentinel
 *  instead of a rejection — callers fold that into a `timeout` outcome. */
async function sleepOrAbort(
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>,
  ms: number,
  signal?: AbortSignal,
): Promise<typeof ABORTED | void> {
  try {
    await sleep(ms, signal);
  } catch (e) {
    if (isAbortError(e)) return ABORTED;
    throw e;
  }
}

function outcomeForRun(run: RunSummary | undefined): WaitOutcome | null {
  if (run?.status === 'done') return { kind: 'done', run };
  if (run?.status === 'failed') return { kind: 'failed', run };
  if (run?.status === 'cancelled') return { kind: 'cancelled', run };
  return null;
}

/**
 * Polls `GET /pulls/:id/runs` every `intervalMs` until `runId` leaves
 * `running`, the `timeoutMs` deadline (measured from `now()`) passes, or
 * `signal` aborts. A 429 is not an error — it backs off to
 * `max(intervalMs, 10s)` and retries. A transient `api_unreachable` gets up
 * to two consecutive retries before it is rethrown.
 */
export async function waitForRun(
  api: DevDigestApi,
  prId: string,
  runId: string,
  opts: {
    timeoutMs: number;
    intervalMs: number;
    signal?: AbortSignal;
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
    now?: () => number;
    onProgress?: (elapsedMs: number) => void;
  },
): Promise<WaitOutcome> {
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const start = now();
  let unreachableRetries = 0;

  for (;;) {
    if (opts.signal?.aborted) {
      return { kind: 'timeout', elapsedMs: now() - start };
    }

    let runs: RunSummary[] | null = null;
    try {
      runs = await api.listRuns(prId);
      unreachableRetries = 0;
    } catch (e) {
      const isRateLimited = e instanceof ApiHttpError && e.status === 429;
      const isRetryableUnreachable =
        e instanceof ApiUnreachableError && unreachableRetries < MAX_UNREACHABLE_RETRIES;
      if (!isRateLimited && !isRetryableUnreachable) throw e;

      if (isRetryableUnreachable) unreachableRetries += 1;
      const waitMs = isRateLimited
        ? Math.max(opts.intervalMs, RATE_LIMIT_BACKOFF_MS)
        : opts.intervalMs;
      const result = await sleepOrAbort(sleep, waitMs, opts.signal);
      if (result === ABORTED) return { kind: 'timeout', elapsedMs: now() - start };
      continue;
    }

    const outcome = outcomeForRun(runs.find((r) => r.run_id === runId));
    if (outcome) return outcome;

    const elapsedMs = now() - start;
    opts.onProgress?.(elapsedMs);
    if (elapsedMs >= opts.timeoutMs) {
      return { kind: 'timeout', elapsedMs };
    }

    const result = await sleepOrAbort(sleep, opts.intervalMs, opts.signal);
    if (result === ABORTED) return { kind: 'timeout', elapsedMs: now() - start };
  }
}
