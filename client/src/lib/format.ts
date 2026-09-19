/**
 * Shared formatters for run cost/duration/tokens — used by the PR list COST
 * column, the run timeline row, and the run trace drawer's stat tiles, so all
 * three render identically. See specs/L01-run-cost-badge.md.
 */

/**
 * Adaptive-precision USD cost. Cheap runs (the common case, often
 * sub-cent) need more decimals or they all round to "$0.00"; expensive runs
 * need fewer. `null`/`undefined` means the cost is UNKNOWN (e.g. an
 * unrecognized model with no price data) and must render as "—", never "$0.00"
 * — collapsing "unknown" into "free" is exactly the bug this format avoids.
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 10) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/** Seconds-formatted duration (e.g. "8.2s"). */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Compact token-count formatter (e.g. 8200 → "8.2K", 1500 → "1.5K"). */
function compactTokens(n: number): string {
  return `${(n / 1000).toFixed(1)}K`;
}

/** Token in→out summary for the drawer's TOKENS stat (e.g. "8.2K→1.3K"). */
export function formatTokens(tokensIn: number, tokensOut: number): string {
  return `${compactTokens(tokensIn)}→${compactTokens(tokensOut)}`;
}

/** Thousands-separated token count for the timeline row (e.g. 9119 → "9,119"). */
export function formatTokenCount(n: number): string {
  return n.toLocaleString("en-US");
}
