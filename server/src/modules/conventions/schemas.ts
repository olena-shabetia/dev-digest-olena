import { z } from 'zod';
import { ConventionCategory, ConventionStatus } from '@devdigest/shared';

/** Route-local request/response schemas for the conventions module. */

export const ExtractAccepted = z.object({
  scan_id: z.string(),
  job_id: z.string().nullable(),
});
export type ExtractAccepted = z.infer<typeof ExtractAccepted>;

export const PatchConventionBody = z.object({
  status: ConventionStatus.optional(),
  rule: z.string().min(1).optional(),
  category: ConventionCategory.optional(),
});
export type PatchConventionBody = z.infer<typeof PatchConventionBody>;

export const BuildSkillBody = z.object({
  agent_id: z.string().uuid().optional(),
});
export type BuildSkillBody = z.infer<typeof BuildSkillBody>;

/**
 * Structured-output schema for the extraction LLM call
 * (`completeStructured`). Deliberately narrow: "cite exactly one file from
 * the samples and the exact gutter line number; never cite anything not
 * shown" is enforced downstream by `helpers.ts#verifyEvidence`, not by this
 * schema — the schema only shapes the JSON, verification is code-side.
 */
export const ConventionExtraction = z.object({
  candidates: z
    .array(
      z.object({
        category: ConventionCategory,
        rule: z.string().min(1).max(400),
        rationale: z.string().optional(),
        evidence: z.object({
          file: z.string().min(1),
          line: z.number().int().positive(),
        }),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(50),
});
export type ConventionExtraction = z.infer<typeof ConventionExtraction>;
