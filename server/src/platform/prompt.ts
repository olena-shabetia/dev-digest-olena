/**
 * Prompt assembly moved to @devdigest/reviewer-core (the shared review engine
 * consumed by both this server and the CI agent-runner). This file is a thin
 * re-export shim so existing `platform/prompt.js` importers keep working.
 */
export {
  assemblePrompt,
  wrapUntrusted,
  type PromptParts,
  type AssembledPrompt,
} from '@devdigest/reviewer-core';
import { wrapUntrusted } from '@devdigest/reviewer-core';

/**
 * L02/HW2 — the trust rule (specs/L02-skills.md,
 * specs/L02-conventions-extractor.md): `source: 'manual'` skill bodies pass
 * through to `reviewPullRequest` as-is; so does `source: 'extracted'` — its
 * body is our own template rendered over human-accepted, code-verified
 * evidence from the user's own repo (the conventions extractor), not
 * third-party text, so it earns the same trust as a hand-written skill.
 * `imported_url`/`community` bodies are wrapped with
 * `wrapUntrusted('skill:<name>', body)` first. This
 * lives here (platform, cross-cutting) rather than in the skills module's own
 * helpers.ts so both the skills module (which needs it to build a preview)
 * and the reviews module's run-executor (which resolves an agent's linked
 * skills into prompt input) can use it WITHOUT one feature module importing
 * another (`.dependency-cruiser.cjs`'s `no-cross-module-imports` rule) —
 * `src/modules/skills/helpers.ts` re-exports this same function so it is
 * still unit-tested as part of that module's test suite.
 */
export interface SkillBodySource {
  skill: { name: string; body: string; source: string };
}

export function resolveSkillBodies(links: SkillBodySource[]): string[] {
  return links.map(({ skill }) =>
    skill.source === 'manual' || skill.source === 'extracted'
      ? skill.body
      : wrapUntrusted(`skill:${skill.name}`, skill.body),
  );
}
