import type { ConventionCandidate, ConventionCategory } from "@devdigest/shared";
import { MAX_EVIDENCE_LINKS_PER_RULE } from "./constants";

/** Group accepted candidates by category, preserving first-seen order —
 *  mirrors `server/src/modules/conventions/helpers.ts#groupByCategory`. */
function groupByCategory(candidates: ConventionCandidate[]): Map<ConventionCategory, ConventionCandidate[]> {
  const out = new Map<ConventionCategory, ConventionCandidate[]>();
  for (const c of candidates) {
    const arr = out.get(c.category);
    if (arr) arr.push(c);
    else out.set(c.category, [c]);
  }
  return out;
}

/**
 * Client-side rendering of the SAME grouped-by-category markdown the server
 * builds in `POST /repos/:id/conventions/skill` (there is no dry-run/preview
 * endpoint for this route — see `server/src/modules/conventions/schemas.ts`'s
 * `BuildSkillBody`, which is `{agent_id?}` only). This is purely a starting
 * point for the modal's editable body textarea; the server always computes
 * its own body from the accepted rows when the route actually runs, and any
 * edits the user makes here are reconciled afterward via `PUT /skills/:id`.
 */
export function buildSkillMarkdownPreview(accepted: ConventionCandidate[], repoLabel: string): string {
  if (accepted.length === 0) {
    return `# Repo conventions — ${repoLabel}\n\nNo accepted conventions yet.`;
  }
  const groups = groupByCategory(accepted);
  const sections: string[] = [`# Repo conventions — ${repoLabel}`];
  for (const [category, items] of groups) {
    sections.push(`## ${category}`);
    for (const item of items) {
      const links = item.evidences
        .slice(0, MAX_EVIDENCE_LINKS_PER_RULE)
        .map((e) => (e.url ? `[${e.path}:${e.line}](${e.url})` : `${e.path}:${e.line ?? "?"}`))
        .join(" · ");
      sections.push(`- *${item.rule}*${links ? `\n  - Evidence: ${links}` : ""}`);
    }
  }
  return sections.join("\n\n");
}

/** ~chars/4 token estimate, same rule of thumb as
 *  `reviewer-core/src/prompt.ts#assemblePrompt`'s `skills_tokens`. */
export function estimateTokens(body: string): number {
  return Math.ceil(body.length / 4);
}
