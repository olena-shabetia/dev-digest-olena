import { z } from 'zod';

/**
 * Route-local response schema for `GET /workspace`. Not in `@devdigest/shared`
 * — the client doesn't type this response today (F1 workspace-overview
 * surface only), so there is no cross-package contract to keep in sync.
 * Mirrors the literal built in `workspace/routes.ts`.
 */
export const WorkspaceRepoSummary = z.object({
  id: z.string(),
  full_name: z.string(),
  clone_path: z.string().nullable(),
  last_polled_at: z.string().nullable(),
  cloned: z.boolean(),
});
export type WorkspaceRepoSummary = z.infer<typeof WorkspaceRepoSummary>;

export const WorkspaceInfo = z.object({
  workspaceId: z.string(),
  cloneDir: z.string(),
  repos: z.array(WorkspaceRepoSummary),
});
export type WorkspaceInfo = z.infer<typeof WorkspaceInfo>;
