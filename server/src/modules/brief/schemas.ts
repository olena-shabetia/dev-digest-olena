import { z } from 'zod';
import { Risk } from '@devdigest/shared';

/**
 * What the model returns. Deliberately free of `.max()` / `.min()` caps and of
 * optional/default fields (OpenAI strict json_schema): an over-long answer must
 * not become a schema failure and a paid retry. `groundBrief` truncates and
 * snaps instead.
 */
export const BriefExtraction = z.object({
  summary: z.string(),
  risks: z.array(Risk),
  review_focus: z.array(
    z.object({
      file: z.string(),
      line: z.number().int(),
      reason: z.string(),
    }),
  ),
});
export type BriefExtraction = z.infer<typeof BriefExtraction>;
