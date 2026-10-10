/* eval-format.ts — display formatting for eval metrics. Metrics and deltas are
   computed by the server (fractions in 0..1); the client only formats them. */

/** Whole-number percent ("67%"); null (not applicable) passes through. */
export function formatPercent(v: number | null): string | null {
  if (v == null) return null;
  return `${Math.round(v * 100)}%`;
}

/** Delta fraction → whole percentage points. `text` is the unsigned magnitude
 *  ("5"); `direction` tells the caller which sign/arrow to render. */
export function formatDeltaPoints(
  d: number | null,
): { text: string; direction: "up" | "down" | "flat" } | null {
  if (d == null) return null;
  const points = Math.round(d * 100);
  if (points === 0) return { text: "0", direction: "flat" };
  return { text: String(Math.abs(points)), direction: points > 0 ? "up" : "down" };
}
