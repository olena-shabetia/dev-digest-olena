import type { RepoIndexState } from '@devdigest/shared';
import type { IndexState } from './types.js';

/**
 * Pure helper for the repo-intel module — row/facade shape → DTO mapping.
 * `repo-intel` was the one module in `server/` still handing a `Date` object
 * to a route handler (`IndexState.updatedAt`); every other module's
 * `helpers.ts` already does this `.toISOString()` conversion (see
 * `repos/helpers.ts`, `agents/helpers.ts`, `reviews/helpers.ts`).
 *
 * Why this matters beyond style: it currently "works" only because Fastify's
 * default JSON.stringify calls `Date#toJSON()` for us. A `response:` schema
 * (`RepoIndexState`, `z.string()` on `updatedAt`) runs `safeParse` against the
 * in-memory object BEFORE stringification — it would reject the raw `Date`
 * and turn every `GET /repos/:id/index-state` call into a 500. This mapper
 * must exist before that schema is attached to the route.
 */
export function toIndexStateDto(state: IndexState): RepoIndexState {
  return {
    repoId: state.repoId,
    status: state.status,
    filesIndexed: state.filesIndexed,
    filesSkipped: state.filesSkipped,
    durationMs: state.durationMs,
    ...(state.reason !== undefined ? { reason: state.reason } : {}),
    lastIndexedSha: state.lastIndexedSha,
    indexerVersion: state.indexerVersion,
    updatedAt: state.updatedAt.toISOString(),
    ...(state.degraded !== undefined ? { degraded: state.degraded } : {}),
    ...(state.degradedReason !== undefined ? { degradedReason: state.degradedReason } : {}),
  };
}
