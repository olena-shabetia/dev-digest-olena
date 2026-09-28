import type { Container } from '../../platform/container.js';
import type { BlastRadiusResponse } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { toBlastRadiusResponse } from './helpers.js';

/**
 * L04 — Blast Radius business logic. Zero SQL (server/AGENTS.md): every read
 * goes through `container.reviewRepo` (`getPull`, `getPrFiles`) and
 * `container.repoIntel.getBlastRadius`, never a sibling module import
 * (server/INSIGHTS.md 2026-09-21) and never a new `container.blast*` getter
 * (D3, `server/specs/L04-blast-radius.api.md`) — nothing outside `blast/`
 * consumes this service, so it is built inline in `routes.ts`.
 *
 * `repoIntel.getBlastRadius` is called exactly once per request, wrapped in
 * try/catch — every `repoIntel.*` call is best-effort (server/AGENTS.md). A
 * throw degrades to `degraded:true, reason:'index_failed'` with empty
 * arrays; it never becomes a 500.
 */
export class BlastService {
  constructor(private container: Container) {}

  async getBlastRadius(workspaceId: string, prId: string): Promise<BlastRadiusResponse> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const files = await this.container.reviewRepo.getPrFiles(prId);
    const paths = files.map((f) => f.path);

    let result;
    try {
      result = await this.container.repoIntel.getBlastRadius(pull.repoId, paths);
    } catch {
      result = {
        changedSymbols: [],
        callers: [],
        impactedEndpoints: [],
        degraded: true as const,
        reason: 'index_failed' as const,
      };
    }

    return toBlastRadiusResponse(result);
  }
}
