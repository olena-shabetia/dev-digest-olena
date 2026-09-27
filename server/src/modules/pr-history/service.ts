import type { Container } from '../../platform/container.js';
import type { PrHistory } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { buildHistoryNote, computeFilesOverlap } from './helpers.js';
import { MAX_CANDIDATES_SCANNED, MAX_HISTORY_ITEMS } from './constants.js';

/**
 * P3 — "Prior PRs touching these files". Unlike `blast/service.ts`, this has
 * no precomputed index to read: repo-intel's facade doesn't carry PR history,
 * so this module calls the live GitHub API (`container.github()`) directly,
 * per server/specs/L04-blast-radius.api.md's P3 note. It is therefore:
 *
 *  - Best-effort by the same rule repo-intel enrichment follows
 *    (server/AGENTS.md): any GitHub failure (no token, rate limit, network)
 *    degrades to `{history: []}`, never a 500.
 *  - Bounded: at most `MAX_CANDIDATES_SCANNED` recent merged PRs get their
 *    files fetched (one `getPullRequest` call each) before this gives up —
 *    unlike `blast`, there is no cheap DB path here, so the request has a
 *    real GitHub-rate-limit cost. Callers should fetch this lazily (on the
 *    client, only once the panel is expanded), not on every page load.
 *  - No container getter (same D3 reasoning as `blast/service.ts`): nothing
 *    outside `pr-history/` consumes this service, so it is built inline in
 *    `routes.ts`.
 */
export class PrHistoryService {
  constructor(private container: Container) {}

  async getPrHistory(workspaceId: string, prId: string): Promise<PrHistory> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const changedFiles = (await this.container.reviewRepo.getPrFiles(prId)).map((f) => f.path);
    if (changedFiles.length === 0) return { history: [] };

    try {
      const repo = await this.container.reviewRepo.getRepo(pull.repoId);
      if (!repo) return { history: [] };

      const gh = await this.container.github();
      const ref = { owner: repo.owner, name: repo.name };

      const candidates = (await gh.listPullRequests(ref))
        .filter((p) => p.status === 'merged' && p.number !== pull.number)
        .sort((a, b) => (b.merged_at ?? b.updated_at ?? '').localeCompare(a.merged_at ?? a.updated_at ?? ''))
        .slice(0, MAX_CANDIDATES_SCANNED);

      const history: PrHistory['history'] = [];
      for (const candidate of candidates) {
        if (history.length >= MAX_HISTORY_ITEMS) break;
        const detail = await gh.getPullRequest(ref, candidate.number);
        const files_overlap = computeFilesOverlap(
          detail.files.map((f) => f.path),
          changedFiles,
        );
        if (files_overlap.length === 0) continue;
        history.push({
          pr_number: candidate.number,
          title: candidate.title,
          merged_at: candidate.merged_at ?? candidate.updated_at ?? '',
          author: candidate.author,
          files_overlap,
          notes: buildHistoryNote(files_overlap.length, changedFiles.length),
        });
      }

      return { history };
    } catch {
      // Best-effort: no token, rate-limited, network error — never fail the request.
      return { history: [] };
    }
  }
}
