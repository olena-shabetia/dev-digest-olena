/* hooks/conventions.ts — React Query hooks for the Conventions page (HW2).
   Shape copied from hooks/reviews.ts's polling pattern: GET /repos/:id/conventions
   is a pure DB read (server/specs/L02-conventions-extractor.api.md — restart
   durable), so it's safe to poll while a scan is queued/running and stop once
   it settles into done/failed. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ConventionCandidate, ConventionCategory, ConventionScan, ConventionStatus, Skill } from "@devdigest/shared";

export interface ConventionsResponse {
  scan: ConventionScan | null;
  candidates: ConventionCandidate[];
}

/** Polls every 2s while the latest scan is `queued`/`running`; stops once it
 *  settles into `done`/`failed`, or when there's no scan yet. */
export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionsResponse>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
    refetchInterval: (query) => {
      const status = query.state.data?.scan?.status;
      return status === "queued" || status === "running" ? 2000 : false;
    },
  });
}

export function useExtractConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ scan_id: string; job_id: string | null }>(`/repos/${repoId}/conventions/extract`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conventions", repoId] }),
  });
}

export interface PatchConventionInput {
  id: string;
  patch: {
    status?: ConventionStatus;
    rule?: string;
    category?: ConventionCategory;
  };
}

export function usePatchConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: PatchConventionInput) => api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: (updated) => {
      qc.setQueryData<ConventionsResponse | undefined>(["conventions", repoId], (prev) =>
        prev
          ? { ...prev, candidates: prev.candidates.map((c) => (c.id === updated.id ? updated : c)) }
          : prev,
      );
    },
  });
}

/** `POST /repos/:id/conventions/skill` — the ONLY field the server route
 *  accepts is `agent_id` (see schemas.ts's `BuildSkillBody`); it builds the
 *  `repo-conventions` skill itself from the accepted candidates. Any
 *  metadata/body edits made in the create-skill modal are applied
 *  client-side afterward via `useUpdateSkill` (`PUT /skills/:id`), which DOES
 *  accept name/description/type/enabled/body. */
export function useBuildConventionsSkill(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId?: string) =>
      api.post<Skill>(`/repos/${repoId}/conventions/skill`, agentId ? { agent_id: agentId } : undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}
