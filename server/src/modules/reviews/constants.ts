/**
 * Review module constants.
 */

/**
 * Studio review strategy. 'single-pass' = send the WHOLE diff in ONE LLM call.
 * We deliberately do NOT use 'auto'/map-reduce by default: map-reduce makes one
 * call PER FILE, which is slow and fragile (any single file's transient 5xx
 * fails the entire run) and unnecessary — the whole diff already fits the
 * model's context.
 */
export const REVIEW_STRATEGY = 'single-pass' as const;

/**
 * Hard ceiling for ONE agent's LLM call. Without it a hung provider request
 * blocks the whole sequential run (the executor loops over agents one by one),
 * so every agent queued behind it never starts. Real runs observed in the dev
 * DB top out around 10 minutes (Test Quality Reviewer), hence 10.
 */
export const REVIEW_LLM_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * The scheduled sweep only fails rows older than this. The agent_runs rows for
 * ALL agents of one "Run Review" are created up front as 'running' and the
 * agents then execute one after another, so a row legitimately waits behind the
 * earlier agents. 30 min covers 5 agents even when one of them is slow; it is
 * a backstop for runs that outlive their own timeout, not a per-run deadline.
 */
export const STALE_RUN_MAX_AGE_MS = 30 * 60 * 1000;

/** `agent_runs.error` text for rows reaped at boot (their process is gone). */
export const REAP_REASON_BOOT = 'Interrupted: the API server restarted while this run was in progress';

/** `agent_runs.error` text for rows the periodic sweep gave up on. */
export const REAP_REASON_SWEEP = 'Timed out: no result was recorded within the allowed time';
