/* hooks/ci.ts — React Query hooks for L07 Export to CI.
     GET  /agents/:id/ci             → CiAgentOverview (ingests on read)
     GET  /ci/runs                   → CiRunsResponse  (ingests on read)
     POST /agents/:id/ci/preview     → CiPreview       (writes nothing)
     POST /agents/:id/export-ci      → CiExport
   Ingest is pull-based (on open + Refresh), so focus refetch is off: a tab
   focus must not hit GitHub. No polling. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  CiAgentOverview,
  CiExport,
  CiExportInputBody,
  CiPreview,
  CiRunsResponse,
} from "@devdigest/shared";

/** GET /agents/:id/ci */
export function useCiAgentOverview(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["ci", "agent", agentId],
    queryFn: () => api.get<CiAgentOverview>(`/agents/${agentId}/ci`),
    enabled: !!agentId,
    refetchOnWindowFocus: false,
  });
}

/** GET /ci/runs */
export function useCiRuns() {
  return useQuery({
    queryKey: ["ci", "runs"],
    queryFn: () => api.get<CiRunsResponse>("/ci/runs"),
    refetchOnWindowFocus: false,
  });
}

/** POST /agents/:id/ci/preview — generates the file tree, stores nothing. */
export function useCiPreview() {
  return useMutation({
    mutationFn: (v: { agentId: string; input: CiExportInputBody }) =>
      api.post<CiPreview>(`/agents/${v.agentId}/ci/preview`, v.input),
  });
}

/** POST /agents/:id/export-ci — opens/reuses the PR or returns a zip. */
export function useCiExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { agentId: string; input: CiExportInputBody }) =>
      api.post<CiExport>(`/agents/${v.agentId}/export-ci`, v.input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ci"] }),
  });
}
