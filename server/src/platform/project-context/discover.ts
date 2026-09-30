/**
 * L05 — project-context discovery: walks a repo's clone on disk and returns
 * the set of markdown docs under the configured glob roots.
 *
 * Never follows symlinks, never descends into a dot-directory or
 * `PROJECT_CONTEXT_EXCLUDED_DIRS`, never reads a file over
 * `PROJECT_CONTEXT_MAX_FILE_BYTES`, and stops once
 * `PROJECT_CONTEXT_MAX_DOCS` docs have been found.
 */
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, matchesGlob, relative, sep } from 'node:path';
import type { ProjectDocType } from '@devdigest/shared';
import { PROJECT_CONTEXT_EXCLUDED_DIRS, PROJECT_CONTEXT_MAX_DOCS, PROJECT_CONTEXT_MAX_FILE_BYTES } from './constants.js';
import { capDocContent, docTypeFor, estimateDocTokens, isSafeDocPath } from './paths.js';

const EXCLUDED_SET: ReadonlySet<string> = new Set(PROJECT_CONTEXT_EXCLUDED_DIRS);

export interface DiscoveredDoc {
  path: string;
  type: ProjectDocType;
  size: number;
  tokens: number;
  truncated: boolean;
}

/** A repo's clone location, as known to the caller — never a `Repo` DB row. */
export interface RepoCloneRef {
  owner: string;
  name: string;
  clonePath: string | null;
}

/** Thrown for an unsafe path, or one that escapes its intended root once resolved. */
export class ProjectDocPathError extends Error {}

/**
 * Lists the repo's project-context docs. `not_cloned` when there is no clone
 * on disk (or it's inaccessible) — an empty listing, not an error.
 */
export async function listRepoDocs(
  repo: RepoCloneRef,
  globs: readonly string[],
): Promise<{ status: 'ok' | 'not_cloned'; docs: DiscoveredDoc[] }> {
  if (!repo.clonePath) return { status: 'not_cloned', docs: [] };

  const root = repo.clonePath;
  let rootRealPath: string;
  try {
    rootRealPath = await realpath(root);
  } catch {
    return { status: 'not_cloned', docs: [] };
  }

  const out: DiscoveredDoc[] = [];
  await walkDir(rootRealPath, rootRealPath, globs, out);
  out.sort((a, b) => a.path.localeCompare(b.path));

  return { status: 'ok', docs: out.slice(0, PROJECT_CONTEXT_MAX_DOCS) };
}

async function walkDir(
  root: string,
  dir: string,
  globs: readonly string[],
  out: DiscoveredDoc[],
): Promise<void> {
  if (out.length >= PROJECT_CONTEXT_MAX_DOCS) return;

  let entries: Dirent[];
  try {
    entries = (await readdir(dir, { withFileTypes: true })) as Dirent[];
  } catch {
    // Unreadable directory — skip cleanly, keep walking siblings.
    return;
  }

  for (const entry of entries) {
    if (out.length >= PROJECT_CONTEXT_MAX_DOCS) return;
    if (entry.isSymbolicLink()) continue; // never follow symlinks

    const name = entry.name;
    if (name.startsWith('.')) continue; // dot-directories AND dot-files excluded

    if (entry.isDirectory()) {
      if (EXCLUDED_SET.has(name)) continue;
      await walkDir(root, join(dir, name), globs, out);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!name.endsWith('.md')) continue;

    const full = join(dir, name);
    const rel = relative(root, full).split(sep).join('/');

    if (!isSafeDocPath(rel)) continue;
    if (!globs.some((g) => matchesGlob(rel, g))) continue;

    const type = docTypeFor(rel);
    if (!type) continue;

    let size: number;
    try {
      size = (await stat(full)).size;
    } catch {
      continue;
    }
    if (size > PROJECT_CONTEXT_MAX_FILE_BYTES) continue;

    let raw: string;
    try {
      raw = await readFile(full, 'utf8');
    } catch {
      continue;
    }

    const { truncated } = capDocContent(raw);
    out.push({ path: rel, type, size, tokens: estimateDocTokens(raw.length), truncated });
  }
}

/**
 * Reads one doc from the working tree, with realpath containment: the
 * resolved file must live under `cloneRoot`, otherwise `ProjectDocPathError`.
 */
export async function readWorkingTreeDoc(cloneRoot: string, path: string): Promise<string> {
  if (!isSafeDocPath(path)) throw new ProjectDocPathError(`unsafe doc path: ${path}`);

  const rootReal = await realpath(cloneRoot);
  let fileReal: string;
  try {
    fileReal = await realpath(join(cloneRoot, path));
  } catch {
    throw new ProjectDocPathError(`doc not found: ${path}`);
  }

  if (!(fileReal === rootReal || fileReal.startsWith(rootReal + sep))) {
    throw new ProjectDocPathError(`doc path escapes repo root: ${path}`);
  }

  return readFile(fileReal, 'utf8');
}
