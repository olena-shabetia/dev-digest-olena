/**
 * Pure prompt assembly for the extraction LLM call. Every repo excerpt is
 * untrusted, repo-author-controlled content — wrapped via `wrapUntrusted`
 * (from `@devdigest/reviewer-core`, the same hardening every review prompt
 * uses) exactly like a diff or PR description would be.
 */
import type { ChatMessage } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { SampledFile } from './types.js';
import { numberLines } from './sampler.js';

const SYSTEM_PROMPT =
  'You extract MECHANICALLY ENFORCEABLE coding conventions from a sample of a ' +
  'repository\'s own files. Only propose conventions a reviewer could check by ' +
  'reading a diff — naming patterns, structural rules, error-handling idioms, ' +
  'import/typing/async/styling/testing conventions actually followed in the ' +
  'sample. Do not restate generic best practices ("write tests", "handle ' +
  'errors") unless the sample shows a SPECIFIC repo convention for how. Prefer ' +
  '5–15 high-signal rules over an exhaustive list.\n\n' +
  'For every candidate, cite EXACTLY ONE file from the samples shown to you ' +
  '(by its exact path) and the exact 1-based gutter line number printed before ' +
  'each line — never a file or line not shown. Confidence rubric: 0.9 when a ' +
  'config file AND a code sample agree; 0.7 when the pattern recurs in 2+ code ' +
  'samples; 0.5 when it is a single-file observation.';

/** Build the two-message extraction request. `samples` is the deterministic
 *  sample set (configs + diversified ranked code files), each already
 *  clamped + line-numbered by the caller. */
export function buildExtractMessages(samples: SampledFile[]): ChatMessage[] {
  const filesBlock = samples
    .map((s) => wrapUntrusted(`file:${s.path}`, numberLines(s.lines)))
    .join('\n\n');

  const user =
    `## Repository samples (${samples.length} files)\n${filesBlock}\n\n` +
    'Propose the repo\'s house rules as structured candidates, each with a ' +
    'category, a one-sentence rule, and exactly one cited evidence.file + ' +
    'evidence.line from the samples above.';

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: user },
  ];
}
