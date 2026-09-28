/** P3 "Prior PRs" limits (server/AGENTS.md-style bounding, not repo-intel's —
 *  this module has no precomputed index, so these bound live GitHub calls). */

/** Most-recently-merged PRs whose files get fetched before giving up. Each
 *  candidate costs one `getPullRequest` call, so this bounds worst-case
 *  GitHub API usage per request, not just the shown result count. */
export const MAX_CANDIDATES_SCANNED = 15;

/** Max prior PRs returned once found (most-recently-merged first). */
export const MAX_HISTORY_ITEMS = 5;
