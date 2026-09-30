/**
 * L05 — pure path/content helpers for the project-context reader. No I/O.
 */
import type { ProjectDocType } from '@devdigest/shared';
import { PROJECT_CONTEXT_MAX_DOC_CHARS } from './constants.js';

const UNSAFE_CHARS_RE = /["<>]/;
// Any control char (0x00-0x1f) or DEL (0x7f).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f]/;

/**
 * True when `path` is a safe, repo-relative markdown doc path: '/'-separated,
 * no leading '/', no '\\', no empty/'.'/'..' segment, ends '.md', and
 * contains none of '"', '<', '>' or a control character.
 */
export function isSafeDocPath(path: string): boolean {
  if (!path || path.length === 0) return false;
  if (path.startsWith('/')) return false;
  if (path.includes('\\')) return false;
  if (!path.endsWith('.md')) return false;
  if (UNSAFE_CHARS_RE.test(path)) return false;
  if (CONTROL_CHARS_RE.test(path)) return false;

  const segments = path.split('/');
  for (const segment of segments) {
    if (segment.length === 0) return false;
    if (segment === '.' || segment === '..') return false;
  }

  return true;
}

const DOC_TYPE_SEGMENTS: ReadonlySet<string> = new Set(['specs', 'docs', 'insights']);

/**
 * The doc's type chip, derived from the FIRST path segment (left to right)
 * that matches one of `specs`/`docs`/`insights`. `null` when none matches.
 */
export function docTypeFor(path: string): ProjectDocType | null {
  const segments = path.split('/');
  for (const segment of segments) {
    if (DOC_TYPE_SEGMENTS.has(segment)) return segment as ProjectDocType;
  }
  return null;
}

/**
 * Caps `content` at `PROJECT_CONTEXT_MAX_DOC_CHARS`, appending a truncation
 * marker when it exceeds the cap. `originalChars` is always the pre-cap
 * length, for the caller's token estimate.
 */
export function capDocContent(content: string): {
  content: string;
  truncated: boolean;
  originalChars: number;
} {
  const originalChars = content.length;
  if (originalChars <= PROJECT_CONTEXT_MAX_DOC_CHARS) {
    return { content, truncated: false, originalChars };
  }
  const marker = `\n[truncated: showing 12,000 of ${originalChars.toLocaleString('en-US')} characters]`;
  return {
    content: content.slice(0, PROJECT_CONTEXT_MAX_DOC_CHARS) + marker,
    truncated: true,
    originalChars,
  };
}

/** ceil(min(chars, 12000) / 4) — the capped token estimate. */
export function estimateDocTokens(chars: number): number {
  return Math.ceil(Math.min(chars, PROJECT_CONTEXT_MAX_DOC_CHARS) / 4);
}
