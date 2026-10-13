/* DisagreementBlock/helpers.ts — pure filtering over the server-computed
   groups. No grouping/conflict math here (criterion: never recompute). */
import type { FindingGroup } from "@devdigest/shared";

export function visibleGroups(groups: readonly FindingGroup[], onlyConflicts: boolean): FindingGroup[] {
  return onlyConflicts ? groups.filter((g) => g.conflict) : [...groups];
}
