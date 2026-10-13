/**
 * RunnerError — thrown for any pre-flight / configuration failure (missing or
 * invalid manifest, missing skill file, missing required env var, malformed CI
 * context). Distinguished from a plain `Error` only for clearer log messages;
 * both are handled identically by `runCi`'s single top-level catch (see
 * `run.ts`): hard-fail, no PR post, no artifact, non-zero exit (Q5).
 */
export class RunnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunnerError';
  }
}

/**
 * The PR diff, AFTER ignoring generated files, exceeds the single-pass size cap.
 * Handled like any hard-fail (no review posted, no artifact) but exits with
 * code 2 instead of 1, so a log reader can tell "skipped: too big" apart from
 * "reviewed and the gate triggered".
 */
export class DiffTooLargeError extends RunnerError {
  constructor(public readonly bytes: number, public readonly limit: number) {
    super(
      `PR diff is ${Math.ceil(bytes / 1024)} KB after ignoring generated files; ` +
        `the single-pass limit is ${Math.floor(limit / 1024)} KB. Review skipped — ` +
        `split the PR or raise DEVDIGEST_MAX_DIFF_BYTES.`,
    );
    this.name = 'DiffTooLargeError';
  }
}

/** The model call did not finish within the runner's overall deadline. */
export class ReviewTimeoutError extends RunnerError {
  constructor(public readonly ms: number) {
    super(`Model review did not finish within ${Math.round(ms / 1000)}s — aborted.`);
    this.name = 'ReviewTimeoutError';
  }
}
