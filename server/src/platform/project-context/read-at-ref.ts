/**
 * L05 — run-time project-context read: reads attached docs at the PR head
 * commit through `GitClient` only (never the working tree, never `readFile`).
 */
import type { GitClient, RepoRef } from '@devdigest/shared';
import { capDocContent, estimateDocTokens, isSafeDocPath } from './paths.js';

export interface InjectedDoc {
  path: string;
  content: string;
  tokens: number;
  truncated: boolean;
  originalChars: number;
}

export interface SkippedDoc {
  path: string;
  reason: 'unsafe_path' | 'missing_at_head' | 'read_error';
}

/**
 * Reads `paths`, in order, at `headSha`. When the head commit isn't in the
 * local clone yet, fetches it once (`fetchPullHead`) and re-checks; if it's
 * still unavailable, returns `head_unavailable` with nothing read — never
 * falls back to the working tree.
 */
export async function readProjectDocsAtRef(
  git: GitClient,
  repo: RepoRef,
  headSha: string,
  prNumber: number,
  paths: readonly string[],
): Promise<{ status: 'ok' | 'head_unavailable'; docs: InjectedDoc[]; skipped: SkippedDoc[] }> {
  let available = await git.hasCommit(repo, headSha);
  if (!available) {
    try {
      await git.fetchPullHead(repo, prNumber);
    } catch {
      // best-effort — fall through to the re-check below, which will report
      // head_unavailable if the fetch didn't help.
    }
    available = await git.hasCommit(repo, headSha);
  }
  if (!available) {
    return { status: 'head_unavailable', docs: [], skipped: [] };
  }

  const docs: InjectedDoc[] = [];
  const skipped: SkippedDoc[] = [];

  for (const path of paths) {
    if (!isSafeDocPath(path)) {
      skipped.push({ path, reason: 'unsafe_path' });
      continue;
    }

    let raw: string | null;
    try {
      raw = await git.readFileAt(repo, headSha, path);
    } catch {
      skipped.push({ path, reason: 'read_error' });
      continue;
    }

    if (raw === null) {
      skipped.push({ path, reason: 'missing_at_head' });
      continue;
    }

    const { content, truncated, originalChars } = capDocContent(raw);
    docs.push({ path, content, tokens: estimateDocTokens(originalChars), truncated, originalChars });
  }

  return { status: 'ok', docs, skipped };
}
