/**
 * Pure prompt assembly for the intent-derivation LLM call. Every source
 * block is untrusted, PR-author/repo-controlled content — wrapped via
 * `wrapUntrusted` (from `@devdigest/reviewer-core`, the same hardening every
 * review prompt uses) exactly like a diff or PR description would be. This
 * file must stay pure — no I/O, no Drizzle.
 */
import type { ChatMessage } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';

const SYSTEM_PROMPT =
  'You derive what a GitHub pull request is trying to accomplish from the ' +
  'sources shown to you below. Produce a one-to-two-sentence `intent`, a ' +
  'list of `in_scope` items the PR appears to deliberately address, a list ' +
  'of `out_of_scope` items the sources suggest are explicitly NOT part of ' +
  'this change, and `context_gaps` naming anything you needed but did not ' +
  'have.\n\n' +
  'Confidence rubric — propose `high`/`medium`/`low` honestly: use `low` ' +
  'when you only had the title and file paths to go on; use `medium` when ' +
  'you had a body, issue, or spec/plan reference but at least one source ' +
  'was unavailable; use `high` only when the body (or a linked issue/spec) ' +
  'clearly states the goal and every referenced source was available. If ' +
  'any source below is marked unavailable, name what you lacked in ' +
  '`context_gaps` rather than guessing at its content — never invent text ' +
  'for a source you were not shown.';

/**
 * Build the two-message derivation request from the pre-assembled source
 * blocks (`sources.ts#buildIntentSources`'s `blocks`), each individually
 * wrapped with its own label — never one combined untrusted block, so a
 * future prompt-injection review can attribute a finding to its source.
 */
export function buildIntentMessages(blocks: { label: string; text: string }[]): ChatMessage[] {
  const sourcesBlock = blocks.length
    ? blocks.map((b) => wrapUntrusted(b.label, b.text)).join('\n\n')
    : '(no sources were available for this PR)';

  const user =
    `## PR sources\n${sourcesBlock}\n\n` +
    'Derive the PR\'s intent from ONLY the sources above as structured output.';

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: user },
  ];
}
