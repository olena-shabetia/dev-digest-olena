/* hooks/multi-agent.ts — React Query hooks for L07 multi-agent review: start a
   batch run across an explicit agent set, read one run's detail, list a
   repo's runs, and read per-agent cost/duration estimates. */
"use client";

import { useMutation, useQuery, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { AgentRunEstimate, MultiAgentRunDetail, MultiAgentRunListItem, ReviewRunResponse } from "@devdigest/shared";

/** Kick off a review across an explicit set of agents — one `multi_agent_runs`
 *  parent with linked children run in parallel. Invalidates the same queries
 *  the single-agent `useRunReview` does, plus the multi-agent run list. */
export function useStartMultiAgentReview(): UseMutationResult<
  ReviewRunResponse,
  ApiError,
  { prId: string; agentIds: string[] }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prId, agentIds }) => api.post<ReviewRunResponse>(`/pulls/${prId}/review`, { agentIds }),
    onSuccess: (_data, { prId }) => {
      qc.invalidateQueries({ queryKey: ["reviews", prId] });
      qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
      qc.invalidateQueries({ queryKey: ["pr-active-runs", prId] });
      qc.invalidateQueries({ queryKey: ["multi-agent-runs"] });
    },
  });
}

/** One multi-agent run's full detail (children + computed groups/totals).
 *  Polls every 5s while running as a safety net on top of the SSE-end
 *  refetch — `RunBus` replay buffers vanish on restart or after completion,
 *  so SSE alone can miss the running → settled transition. */
export function useMultiAgentRun(id: string | null | undefined) {
  return useQuery({
    queryKey: ["multi-agent-run", id],
    queryFn: () => api.get<MultiAgentRunDetail>(`/multi-agent-runs/${id}`),
    enabled: !!id,
    refetchInterval: (query) => (query.state.data?.status === "running" ? 5000 : false),
  });
}

/** The newest multi-agent runs for a repo (run list on the Configure screen). */
export function useMultiAgentRuns(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["multi-agent-runs", repoId],
    queryFn: () => api.get<MultiAgentRunListItem[]>(`/repos/${repoId}/multi-agent-runs`),
    enabled: !!repoId,
  });
}

/** Per-agent duration/cost estimate from past done runs, workspace-wide. */
export function useAgentRunEstimates() {
  return useQuery({
    queryKey: ["agent-run-estimates"],
    queryFn: () => api.get<AgentRunEstimate[]>("/agent-run-estimates"),
  });
}
