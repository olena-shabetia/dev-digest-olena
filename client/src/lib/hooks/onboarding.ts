/* hooks/onboarding.ts — React Query hooks for the L05b Onboarding Tour.
     GET  /repos/:id/onboarding           → OnboardingTourResponse
     POST /repos/:id/onboarding/generate  → OnboardingGenerateAccepted (202)
   While the server reports state "generating", the tour query polls. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { OnboardingGenerateAccepted, OnboardingTourResponse } from "@devdigest/shared";

/** Poll cadence (ms) while a generation job is in flight. */
export const ONBOARDING_POLL_MS = 2000;

/** GET /repos/:id/onboarding → persisted tour, or none / generating. */
export function useOnboardingTour(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["onboarding-tour", repoId],
    queryFn: () => api.get<OnboardingTourResponse>(`/repos/${repoId}/onboarding`),
    enabled: !!repoId,
    refetchInterval: (q) => (q.state.data?.state === "generating" ? ONBOARDING_POLL_MS : false),
  });
}

/** POST /repos/:id/onboarding/generate → queue (or reuse) a generation job. */
export function useGenerateOnboardingTour(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<OnboardingGenerateAccepted>(`/repos/${repoId}/onboarding/generate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-tour", repoId] });
    },
  });
}
