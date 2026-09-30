import { z } from 'zod';

/**
 * Server-only shape of the single structured LLM call (annotation-only).
 * The client never sees it. No min/max item bounds: strict JSON-schema mode is
 * unreliable with them, so `mergeAnnotations` truncates instead (R-8).
 */
export const OnboardingLlmOutput = z.object({
  architecture: z.object({ prose: z.string(), diagram: z.string().nullable() }),
  reasons: z.array(z.object({ path: z.string(), reason: z.string() })),
  comments: z.array(z.object({ index: z.number().int(), comment: z.string() })),
  rationales: z.array(z.object({ path: z.string(), rationale: z.string() })),
  first_tasks: z.array(z.object({ title: z.string(), detail: z.string(), paths: z.array(z.string()), complexity: z.enum(['low', 'medium', 'high']) })),
});
export type OnboardingLlmOutput = z.infer<typeof OnboardingLlmOutput>;
