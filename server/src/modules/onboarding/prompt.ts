/**
 * Message assembly for the tour-annotation LLM call. Every facts block is
 * repo-author-controlled text, so each one goes through `wrapUntrusted`. The
 * instruction listing which paths/indexes may be annotated is built in code
 * from the deterministic skeleton — the model can only decorate those items.
 */
import type { ChatMessage, OnboardingCommand } from '@devdigest/shared';
import { renderPrompt } from '../../platform/prompts.js';
import { wrapUntrusted } from '../../platform/prompt.js';
import { ONBOARDING_LANGUAGE, ONBOARDING_PROMPT_TEMPLATE } from './constants.js';
import type { FactsBlock } from './types.js';

export interface AnnotationCandidates {
  criticalPaths: string[];
  commands: OnboardingCommand[];
  readingPaths: string[];
}

function list(items: string[]): string {
  return items.length > 0 ? items.map((i) => `- ${i}`).join('\n') : '(none)';
}

export async function buildOnboardingMessages(
  blocks: FactsBlock[],
  candidates: AnnotationCandidates,
): Promise<ChatMessage[]> {
  const system = await renderPrompt(ONBOARDING_PROMPT_TEMPLATE, { language: ONBOARDING_LANGUAGE });
  const facts = blocks.map((b) => wrapUntrusted(b.label, b.text)).join('\n\n');
  const candidateLists = wrapUntrusted(
    'annotation-candidates',
    `Critical paths (key \`reasons\` by exact path):\n${list(candidates.criticalPaths)}\n\n` +
      `Run-locally commands (key \`comments\` by index):\n${list(
        candidates.commands.map((c, i) => `${i}: ${c.command}`),
      )}\n\n` +
      `Reading path (key \`rationales\` by exact path):\n${list(candidates.readingPaths)}`,
  );
  const instruction =
    'Annotate ONLY the items listed in the annotation-candidates block above: write one `reasons` ' +
    'entry per critical path (exact path), one `comments` entry per command index (single line), and ' +
    'one `rationales` entry per reading-path file (exact path). ' +
    'Also write the architecture `prose` (Markdown) and an optional mermaid `diagram`, and 3 to 5 ' +
    '`first_tasks` whose `paths` cite only paths or directories that appear in the facts above, each with a ' +
    '`complexity` of low, medium or high judged by the scope of the change.';
  return [
    { role: 'system', content: system },
    { role: 'user', content: `${facts}\n\n${candidateLists}\n\n${instruction}` },
  ];
}
