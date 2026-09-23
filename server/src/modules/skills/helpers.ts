import { unzipSync, strFromU8 } from 'fflate';
import type { Skill, SkillImportPreview, SkillSource, SkillType } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { DEFAULT_SKILL_TYPE, EXECUTABLE_EXTENSIONS } from './constants.js';

// Re-exported for backwards compatibility / discoverability from this module —
// implementation lives in platform/prompt.ts so the reviews module's
// run-executor can use it too without a cross-module import; see the doc
// comment there for why.
export { resolveSkillBodies, type SkillBodySource } from '../../platform/prompt.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping, the
 * body-change-bump rule, markdown/archive import parsing, and the trust rule
 * that wraps untrusted skill bodies before they reach `reviewPullRequest`.
 * No I/O — structurally typed against the row shape rather than importing
 * `./repository.js` (helpers.ts must stay a leaf; see
 * `.dependency-cruiser.cjs`'s `helpers-and-constants-are-pure` rule).
 */

/** The subset of a `skills` row `toSkillDto` needs. Deliberately NOT the
 *  actual Drizzle row type — helpers.ts must not import repository.ts. */
export interface SkillRowLike {
  id: string;
  name: string;
  description: string;
  type: string;
  source: string;
  body: string;
  enabled: boolean;
  version: number;
  evidenceFiles?: string[] | null;
}

/**
 * Map a persisted skill row to the public `Skill` DTO. `createdAt` (a `Date`)
 * has no field on the `Skill` contract and must never leak into the response
 * — the zod-fastify serializer runs `safeParse` on the in-memory object
 * BEFORE `JSON.stringify`, so an undeclared `Date` field can turn a working
 * route into a 500 (server/INSIGHTS.md, 2026-09-21).
 */
export interface SkillUsageLike {
  agentCount: number;
  pullFreq: number | null;
  acceptRate: number | null;
}

/** `usage` is populated only by the list route (`GET /skills`) — omitted
 *  entirely (never a fabricated 0) on single-skill routes, which don't run
 *  the extra aggregate query. See the `Skill` contract's doc comment. */
export function toSkillDto(row: SkillRowLike, usage?: SkillUsageLike): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? undefined,
    ...(usage
      ? { agent_count: usage.agentCount, pull_freq: usage.pullFreq, accept_rate: usage.acceptRate }
      : {}),
  };
}

/** Fields whose change bumps a skill's version (narrower than agents' config
 *  change — `skill_versions` snapshots only `body`, so only `body` counts). */
export interface BodyChangePatch {
  body?: string;
}

/** True when `patch.body` differs from the existing row's body. Changes to
 *  only `name`/`description`/`enabled`/`type` do not bump the version. */
export function isBodyChange(existing: Pick<SkillRowLike, 'body'>, patch: BodyChangePatch): boolean {
  return patch.body !== undefined && patch.body !== existing.body;
}

// ---------------------------------------------------------------------------
// Import: markdown parsing
// ---------------------------------------------------------------------------

const VALID_SKILL_TYPES = new Set(['rubric', 'convention', 'security', 'custom']);

/** Parse a leading `---\nkey: value\n...\n---` frontmatter block, flat
 *  `key: value` lines only — no yaml library. Returns {} when absent. */
function parseFrontmatter(text: string): { rest: string; fields: Record<string, string> } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { rest: text, fields: {} };
  const fields: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (key) fields[key] = value;
  }
  return { rest: text.slice(match[0].length), fields };
}

/** Derive a filename stem (no directory, no extension) for the fallback name. */
function filenameStem(filename: string): string {
  const base = filename.split('/').pop() ?? filename;
  return base.replace(/\.(md|markdown)$/i, '');
}

/**
 * Parse an uploaded `.md`/`.markdown` file into a `SkillImportPreview`.
 * `name`: frontmatter `name:` → first `# heading` → filename stem.
 * `description`: frontmatter `description:` → first non-heading paragraph.
 * `type`: frontmatter `type:` if a valid `SkillType`, else `'custom'`.
 */
export function parseSkillMarkdown(filename: string, text: string): SkillImportPreview {
  const { rest, fields } = parseFrontmatter(text);

  const headingMatch = /^#{1,6}\s+(.+)$/m.exec(rest);

  const name = fields.name?.trim() || headingMatch?.[1]?.trim() || filenameStem(filename);

  let description = fields.description?.trim() ?? '';
  if (!description) {
    const paragraphs = rest
      .split(/\r?\n\r?\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && !/^#{1,6}\s+/.test(p));
    description = paragraphs[0]?.replace(/\s+/g, ' ').trim() ?? '';
  }

  const type: SkillType = (VALID_SKILL_TYPES.has(fields.type ?? '')
    ? fields.type
    : DEFAULT_SKILL_TYPE) as SkillType;

  return {
    name,
    description,
    type,
    body: text,
    source_filename: filename,
    ignored_entries: [],
    executable_entries: [],
  };
}

// ---------------------------------------------------------------------------
// Import: archive parsing
// ---------------------------------------------------------------------------

/** True when an archive entry path looks executable by extension. fflate's
 *  Unzipped entries carry no reliable mode bit in browser-safe mode, so this
 *  is extension-based only — every non-markdown entry is ignored regardless. */
export function looksExecutable(path: string): boolean {
  const lower = path.toLowerCase();
  return EXECUTABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown)$/i.test(path);
}

function depth(path: string): number {
  return path.split('/').filter(Boolean).length;
}

/**
 * Pick the skill core out of a decoded zip's entries: `SKILL.md` at any depth
 * wins; otherwise the single shallowest `.md`/`.markdown` file. Throws
 * `ValidationError` when there is no markdown candidate, or when more than
 * one equally-shallow candidate exists (ambiguous).
 *
 * `entries` maps archive path → decoded UTF-8 text for markdown files ONLY —
 * callers must decode text lazily (or not at all) for non-markdown entries so
 * they are never actually read; see `pickSkillFromArchive`'s caller.
 */
export function pickSkillFromArchive(
  markdownEntries: { path: string; text: string }[],
): { path: string; text: string } {
  const skillMd = markdownEntries.filter((e) => /(^|\/)SKILL\.md$/i.test(e.path));
  if (skillMd.length === 1) return skillMd[0]!;
  if (skillMd.length > 1) {
    throw new ValidationError('Archive contains more than one SKILL.md', {
      candidates: skillMd.map((e) => e.path),
    });
  }

  if (markdownEntries.length === 0) {
    throw new ValidationError('Archive contains no markdown skill file');
  }

  const shallowest = Math.min(...markdownEntries.map((e) => depth(e.path)));
  const atShallowest = markdownEntries.filter((e) => depth(e.path) === shallowest);
  if (atShallowest.length > 1) {
    throw new ValidationError('Archive contains more than one candidate skill file', {
      candidates: atShallowest.map((e) => e.path),
    });
  }
  return atShallowest[0]!;
}

/** Every path in a decoded zip, split into markdown candidates (never
 *  auto-selected) vs. everything else. Used by the route to build
 *  `ignored_entries`/`executable_entries` without ever decoding a non-markdown
 *  entry's bytes. */
export function partitionArchiveEntries(paths: string[]): {
  markdownPaths: string[];
  ignoredEntries: string[];
  executableEntries: string[];
} {
  const markdownPaths = paths.filter(isMarkdownPath);
  const ignoredEntries = paths.filter((p) => !isMarkdownPath(p));
  const executableEntries = ignoredEntries.filter(looksExecutable);
  return { markdownPaths, ignoredEntries, executableEntries };
}

/**
 * Parse an uploaded `.zip` into a `SkillImportPreview`. Uses `fflate`
 * (`unzipSync`) — a pure, in-memory inflater that never touches the
 * filesystem, which is what makes "executable entries are never processed"
 * true by construction: every entry's bytes ARE inflated into memory (fflate
 * has no way to list names without inflating), but `strFromU8` — the only
 * step that turns bytes into text — is called ONLY for the chosen markdown
 * entry. Every other entry's inflated bytes are discarded, never decoded to
 * text, never written to disk, never executed.
 */
export function parseSkillArchive(filename: string, buffer: Uint8Array): SkillImportPreview {
  const unzipped = unzipSync(buffer);
  const paths = Object.keys(unzipped).filter((p) => !p.endsWith('/'));
  const { markdownPaths, ignoredEntries, executableEntries } = partitionArchiveEntries(paths);

  const markdownEntries = markdownPaths.map((path) => ({
    path,
    text: strFromU8(unzipped[path]!),
  }));
  const chosen = pickSkillFromArchive(markdownEntries);

  const parsed = parseSkillMarkdown(chosen.path, chosen.text);
  return {
    ...parsed,
    source_filename: filename,
    ignored_entries: ignoredEntries,
    executable_entries: executableEntries,
  };
}

