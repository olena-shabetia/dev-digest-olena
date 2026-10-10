import type { Container } from '../../platform/container.js';
import type { UnifiedDiff } from '@devdigest/shared';
import { loadPullDiff } from '../../platform/diff.js';
import * as schema from '../../db/schema.js';
import type { ReviewRepository, PullRow } from './repository.js';

/**
 * Load the unified diff for a PR. Delegates to the shared platform loader
 * (real `git diff base...head`, falling back to persisted pr_files patches).
 */
export async function loadDiff(
  container: Container,
  repo: ReviewRepository,
  workspaceId: string,
  pull: PullRow,
  repoRow: typeof schema.repos.$inferSelect,
): Promise<UnifiedDiff> {
  return loadPullDiff(
    container.git,
    pull,
    { owner: repoRow.owner, name: repoRow.name },
    (id) => repo.getPrFiles(id),
  );
}
