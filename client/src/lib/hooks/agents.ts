/* hooks/agents.ts — React Query hooks for the A2 Agents tab + Agent Editor. */
"use client";

import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Agent, AgentSkillLink, AgentStats, ModelInfo, Provider, ReviewStrategy, RunSummary } from "@devdigest/shared";

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get<Agent[]>("/agents"),
  });
}

export function useAgent(id: string | null | undefined) {
  return useQuery({
    queryKey: ["agent", id],
    queryFn: () => api.get<Agent>(`/agents/${id}`),
    enabled: !!id,
  });
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  system_prompt: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  enabled?: boolean;
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgentInput) => api.post<Agent>("/agents", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}

export interface UpdateAgentInput {
  id: string;
  patch: Partial<
    Pick<
      Agent,
      | "name"
      | "description"
      | "provider"
      | "model"
      | "system_prompt"
      | "output_schema"
      | "strategy"
      | "ci_fail_on"
      | "repo_intel"
      | "enabled"
    >
  >;
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateAgentInput) => api.put<Agent>(`/agents/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.setQueryData(["agent", data.id], data);
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/agents/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.removeQueries({ queryKey: ["agent", id] });
    },
  });
}

/** Dynamic model list for a provider (editor model picker). */
export function useProviderModels(provider: Provider | null | undefined) {
  return useQuery({
    queryKey: ["provider-models", provider],
    queryFn: () => api.get<ModelInfo[]>(`/providers/${provider}/models`),
    enabled: !!provider,
    staleTime: 5 * 60_000,
  });
}

/** This agent's linked skills (ids + order only) — the Skills tab joins this
 *  against `useSkills()` client-side. */
export function useAgentSkillLinks(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/** Sets/reorders the full set of linked skills in one call — `order` is
 *  assigned server-side from array index (`agents/repository.ts`). Used for
 *  both attach/detach toggles and drag-to-reorder. */
export function useSetAgentSkills(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (skillIds: string[]) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    onSuccess: (data) => qc.setQueryData(["agent-skills", agentId], data),
  });
}

/** Quality/cost aggregates for the Stats tab (GET /agents/:id/stats, L02). */
export function useAgentStats(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-stats", agentId],
    queryFn: () => api.get<AgentStats>(`/agents/${agentId}/stats`),
    enabled: !!agentId,
  });
}

/** Recent run history for the Stats tab's run table (GET /agents/:id/runs, L02). */
export function useAgentRuns(agentId: string | null | undefined, limit?: number) {
  const qs = limit ? `?limit=${limit}` : "";
  return useQuery({
    queryKey: ["agent-runs", agentId, limit],
    queryFn: () => api.get<RunSummary[]>(`/agents/${agentId}/runs${qs}`),
    enabled: !!agentId,
  });
}

/** Batched per-agent linked-skill counts for the Agents grid/rail's
 *  `AgentCard.skillCount` — one query per agent (cache-shared with
 *  `useAgentSkillLinks`'s `["agent-skills", id]` key), read as a plain map. */
export function useAgentsSkillCounts(agentIds: string[]): Record<string, number> {
  const results = useQueries({
    queries: agentIds.map((id) => ({
      queryKey: ["agent-skills", id],
      queryFn: () => api.get<AgentSkillLink[]>(`/agents/${id}/skills`),
    })),
  });
  const counts: Record<string, number> = {};
  agentIds.forEach((id, i) => {
    const data = results[i]?.data;
    if (data) counts[id] = data.length;
  });
  return counts;
}
