/**
 * Pure PR-intent source assembly (L03 — Intent Layer). NO Drizzle, NO LLM
 * call, NO network/file I/O — every value handed in here has already been
 * resolved (or found absent/unavailable) by the caller (`service.ts`). This
 * file must never reference a diff BODY, only reconstructed hunk header
 * strings built from numeric hunk fields — see the no-diff-bodies rule
 * (specs/L03-intent-layer.md), enforced by a unit test asserting no
 * added/removed diff line ever appears in the rendered blocks.
 */
import type { IntentSource, IntentSourceKind } from '@devdigest/shared';
import {
  ISSUE_CLOSING_KEYWORD_SRC,
  ISSUE_REF_SRC,
  MAX_HUNK_HEADERS,
  MAX_SOURCE_CHARS,
} from './constants.js';

const KEYWORDED_ISSUE_RE = new RegExp(`${ISSUE_CLOSING_KEYWORD_SRC}(?:${ISSUE_REF_SRC})`, 'gi');
const BARE_ISSUE_RE = new RegExp(ISSUE_REF_SRC, 'i');

export interface IntentIssueRef {
  /** Display ref, e.g. "#812" or "acme/widgets#812". */
  ref: string;
  owner: string | null;
  repo: string | null;
  number: number;
  /** true when found immediately after a GitHub closing keyword; false = the
   *  single bare-reference fallback used only when no keyworded ref exists. */
  keyworded: boolean;
}

function refFromMatch(m: RegExpMatchArray): { owner: string | null; repo: string | null; number: number } | null {
  const number = Number(m[3] ?? m[6]);
  if (!Number.isFinite(number)) return null;
  const owner = m[1] ?? m[4] ?? null;
  const repo = m[2] ?? m[5] ?? null;
  return { owner, repo, number };
}

function displayRef(owner: string | null, repo: string | null, number: number): string {
  return owner && repo ? `${owner}/${repo}#${number}` : `#${number}`;
}

/**
 * Resolve linked-issue references from a PR body. Requires one of GitHub's
 * documented closing keywords (close/closes/closed, fix/fixes/fixed,
 * resolve/resolves/resolved) immediately before the reference; returns ALL
 * keyworded matches, deduped by issue number, in body order. Only when NO
 * keyworded reference exists anywhere does it fall back to the first bare
 * `#N` (or `owner/repo#N` / issue URL), recorded as `keyworded: false` so
 * the caller can classify it as the weaker `issue_unkeyworded` source kind.
 *
 * Deliberately NOT a reuse of `resolveLinkedIssue`
 * (`adapters/github/octokit.ts:128`) — that regex's optional keyword lets
 * the FIRST bare `#N` anywhere in the body win, even when a real closing
 * keyword later names a different issue (specs/L03-intent-layer.md).
 */
export function resolveIntentIssues(body: string | null | undefined): IntentIssueRef[] {
  const text = body ?? '';
  const out: IntentIssueRef[] = [];
  const seen = new Set<number>();
  for (const m of text.matchAll(KEYWORDED_ISSUE_RE)) {
    const ref = refFromMatch(m);
    if (!ref || seen.has(ref.number)) continue;
    seen.add(ref.number);
    out.push({ ref: displayRef(ref.owner, ref.repo, ref.number), owner: ref.owner, repo: ref.repo, number: ref.number, keyworded: true });
  }
  if (out.length > 0) return out;

  const bare = text.match(BARE_ISSUE_RE);
  if (!bare) return [];
  const ref = refFromMatch(bare);
  if (!ref) return [];
  return [{ ref: displayRef(ref.owner, ref.repo, ref.number), owner: ref.owner, repo: ref.repo, number: ref.number, keyworded: false }];
}

/** Reconstruct a unified-diff hunk header string from purely numeric fields
 *  — the type-level guarantee behind the no-diff-bodies rule: there is no
 *  content field to accidentally read here. */
export function reconstructHunkHeader(h: { oldStart: number; oldLines: number; newStart: number; newLines: number }): string {
  return `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`;
}

function clamp(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n… [truncated]` : text;
}

export interface IntentIssueResolution {
  ref: string;
  keyworded: boolean;
  status: 'used' | 'unavailable';
  title?: string | null;
  body?: string | null;
}

export interface IntentSpecResolution {
  /** Repo-relative path, e.g. "specs/L03-intent-layer.md". */
  path: string;
  kind: 'spec' | 'plan';
  status: 'used' | 'unavailable';
  content?: string | null;
}

export interface IntentHunkHeader {
  file: string;
  header: string;
}

export interface BuildIntentSourcesInput {
  title: string;
  body: string | null;
  issues: IntentIssueResolution[];
  specs: IntentSpecResolution[];
  files: string[];
  hunks: IntentHunkHeader[];
  commits: string[];
}

export interface IntentSourcesResult {
  sources: IntentSource[];
  blocks: { label: string; text: string }[];
}

/**
 * Deterministic source assembly (step 2 of `IntentService#ensureIntent`).
 * Produces BOTH the `IntentSource[]` provenance record (our code's honest
 * accounting of what existed/was absent/failed) and the untrusted prompt
 * blocks `prompt.ts` wraps — never the reverse; the model never gets to
 * report which sources it saw.
 */
export function buildIntentSources(input: BuildIntentSourcesInput): IntentSourcesResult {
  const sources: IntentSource[] = [];
  const blocks: { label: string; text: string }[] = [];

  const pushSource = (kind: IntentSourceKind, status: IntentSource['status'], ref: string | null, chars: number | null) => {
    sources.push({ kind, status, ref, chars });
  };

  const title = input.title.trim();
  pushSource('title', title ? 'used' : 'absent', null, title.length || null);
  if (title) blocks.push({ label: 'pr-title', text: clamp(title, MAX_SOURCE_CHARS.title) });

  const body = (input.body ?? '').trim();
  pushSource('body', body ? 'used' : 'absent', null, body.length || null);
  if (body) blocks.push({ label: 'pr-body', text: clamp(body, MAX_SOURCE_CHARS.body) });

  for (const issue of input.issues) {
    const kind: IntentSourceKind = issue.keyworded ? 'issue' : 'issue_unkeyworded';
    const text = issue.status === 'used' ? `${issue.title ?? ''}\n${issue.body ?? ''}`.trim() : '';
    pushSource(kind, issue.status, issue.ref, text ? text.length : null);
    if (issue.status === 'used' && text) {
      blocks.push({ label: `issue:${issue.ref}`, text: clamp(text, MAX_SOURCE_CHARS.issue) });
    }
  }

  for (const spec of input.specs) {
    const content = spec.status === 'used' ? (spec.content ?? '') : '';
    pushSource(spec.kind, spec.status, spec.path, content ? content.length : null);
    if (spec.status === 'used' && content) {
      blocks.push({ label: `${spec.kind}:${spec.path}`, text: clamp(content, MAX_SOURCE_CHARS[spec.kind]) });
    }
  }

  pushSource('files', input.files.length ? 'used' : 'absent', null, null);
  if (input.files.length) {
    blocks.push({ label: 'changed-files', text: clamp(input.files.join('\n'), MAX_SOURCE_CHARS.files) });
  }

  pushSource('hunks', input.hunks.length ? 'used' : 'absent', null, null);
  if (input.hunks.length) {
    const headerText = input.hunks
      .slice(0, MAX_HUNK_HEADERS)
      .map((h) => `${h.file} ${h.header}`)
      .join('\n');
    blocks.push({ label: 'diff-hunk-headers', text: clamp(headerText, MAX_SOURCE_CHARS.hunks) });
  }

  pushSource('commits', input.commits.length ? 'used' : 'absent', null, null);
  if (input.commits.length) {
    blocks.push({ label: 'commit-messages', text: clamp(input.commits.join('\n'), MAX_SOURCE_CHARS.commits) });
  }

  return { sources, blocks };
}
