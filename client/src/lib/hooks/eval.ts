/* hooks/eval.ts — React Query hooks for the L06 eval pipeline.
     GET    /findings/:id/eval-draft          → EvalCaseDraftResponse (writes nothing)
     POST   /eval-cases/draft-run             → EvalDraftRunResult
     POST   /eval-cases | PUT/GET/DELETE /eval-cases/:id
     GET    /agents/:id/eval-cases            → EvalCaseListResponse
     POST   /agents/:id/eval-runs             → EvalSetRunStarted (202)
     GET    /agents/:id/eval-runs             → EvalAgentRunsResponse (polled)
     GET    /eval-runs/compare?base=&head=    → EvalRunCompare
     GET    /eval/dashboard                   → EvalDashboardIndex
   Request bodies carry only name / diff / expectation location — severity,
   category and title are read-only reference data and are never sent. */
"use client";

import { useEffect, useRef } from "react";
import { useMemo } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { usePrReviews } from "./reviews";
import type {
  EvalAgentRunsResponse,
  EvalCaseCreateRequest,
  EvalCaseDetail,
  EvalCaseDraftResponse,
  EvalCaseListResponse,
  EvalDashboardIndex,
  EvalDraftRunResult,
  EvalExpectationInput,
  EvalExpectationType,
  EvalRunCompare,
  EvalSetRunStarted,
} from "@devdigest/shared";

/** Poll cadence (ms) while a set run is in flight. */
export const EVAL_POLL_MS = 2000;

/** The editable location triple, as sent on the wire. */
export type EvalLocationInput = EvalExpectationInput;

/** GET /findings/:id/eval-draft — always fresh; nothing is stored. */
export function useEvalDraft(findingId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-draft", findingId],
    queryFn: () => api.get<EvalCaseDraftResponse>(`/findings/${findingId}/eval-draft`),
    enabled: !!findingId,
    staleTime: 0,
    gcTime: 0,
  });
}

/** GET /eval-cases/:id */
export function useEvalCase(caseId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-case", caseId],
    queryFn: () => api.get<EvalCaseDetail>(`/eval-cases/${caseId}`),
    enabled: !!caseId,
  });
}

/** GET /agents/:id/eval-cases */
export function useEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-cases", agentId],
    queryFn: () => api.get<EvalCaseListResponse>(`/agents/${agentId}/eval-cases`),
    enabled: !!agentId,
  });
}

/** A saved case, as far as a finding card needs to know about it. */
export interface EvalCaseRef {
  id: string;
  name: string;
}

/**
 * Which findings of one PR already have an eval case: finding id → case.
 * Built from the cases of every agent that reviewed the PR, reusing the
 * `["eval-cases", agentId]` cache entries — so creating, editing or deleting a
 * case (which already invalidate that key) updates the marker with no extra
 * wiring. Empty while loading or when `prId` is unknown.
 */
export function useEvalCaseIndex(prId: string | null | undefined): Map<string, EvalCaseRef> {
  const reviews = usePrReviews(prId);
  const agentIds = useMemo(
    () => [...new Set((reviews.data ?? []).map((r) => r.agent_id).filter((id): id is string => !!id))],
    [reviews.data],
  );
  const results = useQueries({
    queries: agentIds.map((agentId) => ({
      queryKey: ["eval-cases", agentId],
      queryFn: () => api.get<EvalCaseListResponse>(`/agents/${agentId}/eval-cases`),
    })),
  });
  const lists = results.map((r) => r.data);
  return useMemo(() => {
    const index = new Map<string, EvalCaseRef>();
    for (const list of lists) {
      for (const c of list?.cases ?? []) {
        if (c.source_finding_id) index.set(c.source_finding_id, { id: c.id, name: c.name });
      }
    }
    return index;
    // `lists` is rebuilt every render; its element identities are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, lists);
}

/** POST /eval-cases/draft-run — runs the unsaved draft once; stores nothing. */
export function useEvalDraftRun() {
  return useMutation({
    mutationFn: (v: {
      findingId?: string;
      caseId?: string;
      inputDiff: string;
      expectation: EvalLocationInput;
    }) =>
      api.post<EvalDraftRunResult>("/eval-cases/draft-run", {
        ...(v.findingId ? { finding_id: v.findingId } : {}),
        ...(v.caseId ? { case_id: v.caseId } : {}),
        input_diff: v.inputDiff,
        expectation: pickLocation(v.expectation),
      }),
  });
}

/** POST /eval-cases */
export function useCreateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      findingId: string;
      name: string;
      inputDiff: string;
      expectation: EvalLocationInput;
      displayedType: EvalExpectationType;
    }) => {
      const body: EvalCaseCreateRequest = {
        finding_id: v.findingId,
        name: v.name,
        input_diff: v.inputDiff,
        expectation: pickLocation(v.expectation),
        displayed_type: v.displayedType,
      };
      return api.post<EvalCaseDetail>("/eval-cases", body);
    },
    onSuccess: (created) => {
      const agentId = created.agent_id;
      qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-runs", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
      qc.invalidateQueries({ queryKey: ["eval-draft"] });
    },
  });
}

/** PUT /eval-cases/:id */
export function useUpdateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      caseId: string;
      name: string;
      inputDiff: string;
      expectation: EvalLocationInput;
    }) =>
      api.put<EvalCaseDetail>(`/eval-cases/${v.caseId}`, {
        name: v.name,
        input_diff: v.inputDiff,
        expectation: pickLocation(v.expectation),
      }),
    onSuccess: (updated) => {
      const agentId = updated.agent_id;
      qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-case", updated.id] });
      qc.invalidateQueries({ queryKey: ["eval-runs", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    },
  });
}

/** DELETE /eval-cases/:id */
export function useDeleteEvalCase(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.del<{ ok: boolean }>(`/eval-cases/${caseId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-runs", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    },
  });
}

/** GET /agents/:id/eval-runs — polls while a run is active; when it ends,
 *  the case list (last results) and the dashboard are refreshed. */
export function useAgentEvalRuns(agentId: string | null | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["eval-runs", agentId],
    queryFn: () => api.get<EvalAgentRunsResponse>(`/agents/${agentId}/eval-runs`),
    enabled: !!agentId,
    refetchInterval: (q) => (q.state.data?.active_run ? EVAL_POLL_MS : false),
  });

  const wasActive = useRef(false);
  const isActive = !!query.data?.active_run;
  useEffect(() => {
    if (wasActive.current && !isActive) {
      qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    }
    wasActive.current = isActive;
  }, [isActive, agentId, qc]);

  return query;
}

/** POST /agents/:id/eval-runs — seeds `active_run` so polling starts at once. */
export function useStartEvalRun(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalSetRunStarted>(`/agents/${agentId}/eval-runs`),
    onSuccess: ({ run }) => {
      qc.setQueryData<EvalAgentRunsResponse>(["eval-runs", agentId], (old) =>
        old ? { ...old, active_run: run } : old,
      );
      qc.invalidateQueries({ queryKey: ["eval-runs", agentId] });
    },
  });
}

/** GET /eval-runs/compare — base is the run on the left, head on the right. */
export function useEvalCompare(
  baseId: string | null | undefined,
  headId: string | null | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["eval-compare", baseId, headId],
    queryFn: () =>
      api.get<EvalRunCompare>(
        `/eval-runs/compare?base=${encodeURIComponent(baseId ?? "")}&head=${encodeURIComponent(headId ?? "")}`,
      ),
    enabled: enabled && !!baseId && !!headId,
  });
}

/** GET /eval/dashboard */
export function useEvalDashboard() {
  return useQuery({
    queryKey: ["eval-dashboard"],
    queryFn: () => api.get<EvalDashboardIndex>("/eval/dashboard"),
    // While any run is in flight the table shows it as "running"; keep it fresh.
    refetchInterval: (q) =>
      q.state.data?.recent_runs.some((r) => r.status === "running") ? EVAL_POLL_MS : false,
  });
}

/**
 * "Run all agents": start a set run for every agent that has eval cases.
 * An agent already running answers `reused: true`, so this is safe to repeat.
 * Resolves with how many agents were started and how many requests failed.
 */
export function useRunAllEvalAgents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (agentIds: string[]) => {
      const results = await Promise.allSettled(
        agentIds.map((id) => api.post<EvalSetRunStarted>(`/agents/${id}/eval-runs`)),
      );
      return {
        started: results.filter((r) => r.status === "fulfilled" && !r.value.reused).length,
        failed: results.filter((r) => r.status === "rejected").length,
      };
    },
    onSettled: (_d, _e, agentIds) => {
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
      for (const id of agentIds) qc.invalidateQueries({ queryKey: ["eval-runs", id] });
    },
  });
}

/** Strip anything but the three editable location fields before sending. */
function pickLocation(e: EvalLocationInput): EvalLocationInput {
  return { file: e.file, start_line: e.start_line, end_line: e.end_line };
}
