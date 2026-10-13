/* ConfigureRun/helpers.ts — pure selectors over already-fetched data. Never
   fetches on its own; the component passes in what it already has. */
import type { Agent, AgentRunEstimate, ReviewRecord } from "@devdigest/shared";

/**
 * D3 / Recommendation 4 — an agent's one-line preview: the newest review for
 * this agent with a non-null `summary`, else the agent's own description. A
 * review row only exists for a run that reached persistence, so "latest done
 * review" is the same as "latest review" over `reviews`.
 */
export function previewForAgent(agent: Agent, reviews: readonly ReviewRecord[] | undefined): string {
  const candidates = (reviews ?? []).filter((r) => r.agent_id === agent.id && r.summary != null);
  if (candidates.length === 0) return agent.description;
  const newest = candidates.reduce((a, b) => (a.created_at > b.created_at ? a : b));
  return newest.summary ?? agent.description;
}

export interface AggregateEstimate {
  /** Max of the checked agents' known average durations; null when none is known. */
  durationMs: number | null;
  /** True when at least one checked agent has an unknown duration. */
  durationPartial: boolean;
  /** Sum of the checked agents' known average costs; null when none is known. */
  costUsd: number | null;
  /** True when at least one checked agent has an unknown cost. */
  costPartial: boolean;
}

/**
 * The Configure screen footer's aggregate over the checked agents' estimates.
 * Never treats an unknown field as 0 — it is excluded from the sum/max and
 * flips the matching `*Partial` flag instead.
 */
export function aggregateEstimate(
  agentIds: readonly string[],
  estimateByAgent: ReadonlyMap<string, AgentRunEstimate>,
): AggregateEstimate {
  let durationMs: number | null = null;
  let durationPartial = false;
  let costUsd: number | null = null;
  let costPartial = false;
  for (const id of agentIds) {
    const est = estimateByAgent.get(id);
    if (est?.avg_duration_ms != null) {
      durationMs = durationMs == null ? est.avg_duration_ms : Math.max(durationMs, est.avg_duration_ms);
    } else {
      durationPartial = true;
    }
    if (est?.avg_cost_usd != null) {
      costUsd = (costUsd ?? 0) + est.avg_cost_usd;
    } else {
      costPartial = true;
    }
  }
  return { durationMs, durationPartial, costUsd, costPartial };
}
