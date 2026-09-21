import type { ConventionCandidate } from "@devdigest/shared";

/** accepted first, then pending, then rejected last — within each group the
 *  server's own confidence-desc order is preserved (Array#sort is stable). */
const STATUS_RANK: Record<ConventionCandidate["status"], number> = {
  accepted: 0,
  pending: 1,
  rejected: 2,
};

export function sortByStatus(candidates: ConventionCandidate[]): ConventionCandidate[] {
  return [...candidates].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
}
