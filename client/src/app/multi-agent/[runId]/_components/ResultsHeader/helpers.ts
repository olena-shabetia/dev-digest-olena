/* ResultsHeader/helpers.ts — pure derivations over an already-fetched
   MultiAgentRunDetail. Never fetches on its own. */
import type { MultiAgentChild } from "@devdigest/shared";

/** Agent ids of every child with a known agent (criterion 783: "children'
 *  non-null agent_ids") — used to pre-fill the Configure run screen. */
export function childAgentIds(children: readonly MultiAgentChild[]): string[] {
  return children
    .map((c) => c.run.agent_id)
    .filter((id): id is string => id != null);
}
