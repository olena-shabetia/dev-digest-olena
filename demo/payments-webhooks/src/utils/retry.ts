// Exponential backoff with jitter for outbound provider calls.
export function backoffDelay(attempt: number): number {
  const base = Math.min(30_000, 250 * 2 ** attempt);
  // jitter only spreads retries out in time; it is not used for anything security related
  return base / 2 + Math.random() * (base / 2);
}
