/* hooks/project-context.ts — L05 React Query hooks over the project-context
   surface (listing, single-doc preview) and the agent/skill attachment
   routes. Query keys are frozen by the plan (§3):
     ["project-docs", repoId]
     ["project-doc", repoId, path]
     ["agent-context", agentId, repoId]
     ["skill-context", skillId, repoId]
   A successful attachment PUT invalidates the owner key plus
   ["project-docs", repoId] and the ["project-doc", repoId] prefix, since
   attaching/detaching changes each doc's `used_by_agents` count. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ProjectContextListing, SpecFile, ContextAttachmentList } from "../types";

// ---- Listing + single-doc preview (GET /repos/:id/context[/file]) ----

export function useProjectDocs(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["project-docs", repoId],
    queryFn: () => api.get<ProjectContextListing>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

export function useProjectDoc(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: ["project-doc", repoId, path],
    queryFn: () =>
      api.get<SpecFile>(`/repos/${repoId}/context/file?path=${encodeURIComponent(path!)}`),
    enabled: !!repoId && !!path,
  });
}

// ---- Attachment sets (GET/PUT /agents/:id/context/:repoId, /skills/:id/context/:repoId) ----

/** Invalidates the owner's attachment key plus the doc listing/preview for
 *  that repo — `used_by_agents` on each doc depends on every owner's set. */
function invalidateAfterSet(
  qc: ReturnType<typeof useQueryClient>,
  ownerKey: readonly unknown[],
  repoId: string,
) {
  qc.invalidateQueries({ queryKey: ownerKey });
  qc.invalidateQueries({ queryKey: ["project-docs", repoId] });
  qc.invalidateQueries({ queryKey: ["project-doc", repoId] });
}

export function useAgentContextDocs(agentId: string | null | undefined, repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-context", agentId, repoId],
    queryFn: () => api.get<ContextAttachmentList>(`/agents/${agentId}/context/${repoId}`),
    enabled: !!agentId && !!repoId,
  });
}

/** Mutation input carries `repoId` per-call (not bound at hook-creation time)
 *  so the repo id is captured at click time even if the active repo changes
 *  between render and click (SPEC-03 edge case). */
export function useSetAgentContextDocs(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, paths }: { repoId: string; paths: string[] }) =>
      api.put<ContextAttachmentList>(`/agents/${agentId}/context/${repoId}`, { paths }),
    onSuccess: (data, { repoId }) => {
      qc.setQueryData(["agent-context", agentId, repoId], data);
      invalidateAfterSet(qc, ["agent-context", agentId, repoId], repoId);
    },
  });
}

export function useSkillContextDocs(skillId: string | null | undefined, repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-context", skillId, repoId],
    queryFn: () => api.get<ContextAttachmentList>(`/skills/${skillId}/context/${repoId}`),
    enabled: !!skillId && !!repoId,
  });
}

export function useSetSkillContextDocs(skillId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, paths }: { repoId: string; paths: string[] }) =>
      api.put<ContextAttachmentList>(`/skills/${skillId}/context/${repoId}`, { paths }),
    onSuccess: (data, { repoId }) => {
      qc.setQueryData(["skill-context", skillId, repoId], data);
      invalidateAfterSet(qc, ["skill-context", skillId, repoId], repoId);
    },
  });
}
