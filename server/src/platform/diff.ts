import type { GitClient, UnifiedDiff } from '@devdigest/shared';
import { parseUnifiedDiff } from '../adapters/git/diff-parser.js';

/**
 * Shared diff loading. Holds the git-then-pr_files logic that the review run
 * and the eval module both need. Depends on the GitClient PORT and structural
 * arguments only — no Container, no module, no db/** — so any module may use it.
 */
export { parseUnifiedDiff };

export interface PullDiffSource {
  id: string;
  base: string;
  headSha: string;
}

/**
 * Load the unified diff for a PR. Prefers a real `git diff base...head`; falls
 * back to assembling a synthetic unified diff from the persisted pr_files
 * patches (so it works even before a clone completes / in tests).
 */
export async function loadPullDiff(
  git: GitClient,
  pull: PullDiffSource,
  repo: { owner: string; name: string },
  getPrFiles: (prId: string) => Promise<{ path: string; patch: string | null }[]>,
): Promise<UnifiedDiff> {
  try {
    const diff = await git.diff(repo, pull.base, pull.headSha);
    if (diff.files.length > 0) return diff;
  } catch {
    /* fall through to pr_files reconstruction */
  }
  const files = await getPrFiles(pull.id);
  const parts: string[] = [];
  for (const f of files) {
    if (!f.patch) continue;
    parts.push(`diff --git a/${f.path} b/${f.path}`);
    parts.push(`--- a/${f.path}`);
    parts.push(`+++ b/${f.path}`);
    parts.push(f.patch);
  }
  return parseUnifiedDiff(parts.join('\n'));
}
