import type { ConventionEvidence } from "@devdigest/shared";
import { ALSO_SEEN_IN_VISIBLE } from "./constants";

/** Last path segment — `also seen in: Ticket.ts:9` reads better than the full
 *  relative path repeated four times on one card. */
function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

/**
 * Merged occurrences beyond the primary (`evidences[0]`), for the card's
 * "also seen in: Ticket.ts:9 · Refund.ts:7 · +1 more" line. `null` when the
 * candidate has no secondary evidence (a single-occurrence rule).
 */
export function alsoSeenIn(evidences: ConventionEvidence[]): { shown: string[]; remaining: number } | null {
  const rest = evidences.slice(1);
  if (rest.length === 0) return null;
  const shown = rest.slice(0, ALSO_SEEN_IN_VISIBLE).map((e) => `${basename(e.path)}:${e.line ?? "?"}`);
  return { shown, remaining: rest.length - shown.length };
}
