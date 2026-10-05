/**
 * Pure helpers for the PR Brief: hunk parsing, facts assembly with a character
 * budget, grounding of the model output against the PR's real files, and the
 * stale check. No I/O, no Drizzle, no Fastify.
 */
import type { BriefDataGap, PrBriefRecord, ReviewFocusItem, Risk } from '@devdigest/shared';
import {
  BRIEF_BLAST_CALLER_FILES_MAX,
  BRIEF_BLAST_SUMMARY_MAX,
  BRIEF_BLAST_SYMBOLS_MAX,
  BRIEF_DESCRIPTION_MAX,
  BRIEF_DROP_ORDER,
  BRIEF_FACTS_MAX_CHARS,
  BRIEF_FILES_MAX,
  BRIEF_FINDINGS_MAX,
  BRIEF_FOCUS_MAX,
  BRIEF_HUNKS_PER_FILE_MAX,
  BRIEF_INTENT_ITEM_MAX,
  BRIEF_INTENT_LIST_MAX,
  BRIEF_REASON_MAX,
  BRIEF_RISKS_MAX,
  BRIEF_SPEC_DOC_MAX,
  BRIEF_STRING_MAX,
  BRIEF_TITLE_MAX,
  BRIEF_TITLE_STRING_MAX,
} from './constants.js';
import type { BriefExtraction } from './schemas.js';
import type {
  BriefDroppedComponent,
  BriefFactBlock,
  BriefFacts,
  BriefFactsInput,
  HunkRange,
} from './types.js';

const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/** New-side hunk ranges from a unified patch. Never returns patch text, never throws. */
export function parseHunkRanges(patch: string | null | undefined): HunkRange[] {
  if (!patch) return [];
  const ranges: HunkRange[] = [];
  for (const line of patch.split('\n')) {
    const m = HUNK_HEADER_RE.exec(line);
    if (!m) continue;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (!Number.isFinite(start) || !Number.isFinite(count) || count <= 0) continue; // pure deletion
    ranges.push({ start, end: start + count - 1 });
  }
  return ranges;
}

/** Strip a leading `./`, `a/` or `b/` (diff prefixes) from a model-cited path. */
export function normalizeRefPath(p: string): string {
  const t = p.trim();
  if (t.startsWith('./')) return t.slice(2);
  if (t.startsWith('a/') || t.startsWith('b/')) return t.slice(2);
  return t;
}

export function isBriefStale(record: PrBriefRecord | null, headSha: string): boolean {
  return record != null && record.meta.head_sha !== headSha;
}

const cap = (s: string, max: number): string => {
  const t = s.trim();
  return t.length > max ? t.slice(0, max) : t;
};

// ---------------------------------------------------------------------------
// Grounding
// ---------------------------------------------------------------------------

/** Exact, case-sensitive lookup; tries the raw value first, then the prefix-stripped one. */
function resolvePath(raw: string, changedPaths: ReadonlySet<string>): string | null {
  const t = raw.trim();
  if (changedPaths.has(t)) return t;
  const n = normalizeRefPath(t);
  return changedPaths.has(n) ? n : null;
}

function snapLine(line: number, hunks: HunkRange[] | undefined): number {
  if (!hunks || hunks.length === 0) return 1;
  if (line >= 1 && hunks.some((h) => line >= h.start && line <= h.end)) return line;
  let best = hunks[0]!;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const h of hunks) {
    const dist = line < h.start ? h.start - line : line > h.end ? line - h.end : 0;
    if (dist < bestDist) {
      bestDist = dist;
      best = h;
    }
  }
  return best.start;
}

const REF_RE = /^(.*?)(?::(\d+)(?:-(\d+))?)?$/;

function keepRef(ref: string, changedPaths: ReadonlySet<string>): string | null {
  const t = ref.trim();
  if (!t) return null;
  if (resolvePath(t, changedPaths)) return t;
  const m = REF_RE.exec(t);
  if (!m || !m[1]) return null;
  return resolvePath(m[1], changedPaths) ? t : null;
}

/**
 * Apply AC-18..AC-22: trim/cap strings, drop unknown files, snap lines into
 * real hunks, filter risk refs, de-duplicate, cap counts.
 */
export function groundBrief(
  extraction: BriefExtraction,
  changedPaths: ReadonlySet<string>,
  hunksByPath: ReadonlyMap<string, HunkRange[]>,
): { summary: string; risks: Risk[]; review_focus: ReviewFocusItem[] } {
  const risks: Risk[] = extraction.risks.slice(0, BRIEF_RISKS_MAX).map((r) => ({
    kind: cap(r.kind, BRIEF_STRING_MAX),
    title: cap(r.title, BRIEF_TITLE_STRING_MAX),
    explanation: cap(r.explanation, BRIEF_STRING_MAX),
    severity: r.severity,
    file_refs: r.file_refs
      .map((ref) => keepRef(ref, changedPaths))
      .filter((ref): ref is string => ref !== null)
      .map((ref) => cap(ref, BRIEF_STRING_MAX)),
  }));

  const seen = new Set<string>();
  const focus: ReviewFocusItem[] = [];
  for (const item of extraction.review_focus) {
    const path = resolvePath(item.file, changedPaths);
    if (!path) continue;
    const line = snapLine(item.line, hunksByPath.get(path));
    const key = `${path}:${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    focus.push({ file: path, line, reason: cap(item.reason, BRIEF_REASON_MAX) });
    if (focus.length >= BRIEF_FOCUS_MAX) break;
  }

  return { summary: cap(extraction.summary, BRIEF_STRING_MAX), risks, review_focus: focus };
}

// ---------------------------------------------------------------------------
// Facts assembly
// ---------------------------------------------------------------------------

const LABEL_MAX = 120;

/** Labels land in a `source="..."` attribute: drop quotes, angle brackets, control chars. */
function sanitizeLabel(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/["'`<>\u0000-\u001f\u007f]/g, '').trim();
  return cleaned.length > LABEL_MAX ? cleaned.slice(0, LABEL_MAX) : cleaned;
}

interface FactsState {
  specs: boolean;
  hunksPerFile: number;
  findings: boolean;
  callers: boolean;
  fileCount: number;
}

function formatRanges(ranges: HunkRange[], max: number): string {
  return ranges
    .slice(0, max)
    .map((h) => `${h.start}-${h.end}`)
    .join(', ');
}

function renderBlocks(
  input: BriefFactsInput,
  rankedFiles: BriefFactsInput['files'],
  st: FactsState,
): BriefFactBlock[] {
  const blocks: BriefFactBlock[] = [];
  blocks.push({ label: 'pr_title', text: cap(input.title, BRIEF_TITLE_MAX) || '(empty)' });
  blocks.push({
    label: 'pr_description',
    text: cap(input.description, BRIEF_DESCRIPTION_MAX) || '(empty)',
  });

  if (input.intent) {
    const i = input.intent;
    const list = (xs: string[]) =>
      xs.slice(0, BRIEF_INTENT_LIST_MAX).map((x) => `- ${cap(x, BRIEF_INTENT_ITEM_MAX)}`).join('\n') ||
      '(none)';
    blocks.push({
      label: 'intent',
      text:
        `intent: ${cap(i.intent, BRIEF_INTENT_ITEM_MAX)}\nconfidence: ${i.confidence}\n` +
        `in_scope:\n${list(i.in_scope)}\nout_of_scope:\n${list(i.out_of_scope)}`,
    });
  }

  if (input.blast) {
    const b = input.blast;
    const symbols = [...new Set(b.changed_symbols.map((s) => s.name))].slice(0, BRIEF_BLAST_SYMBOLS_MAX);
    let text =
      `summary: ${cap(b.summary, BRIEF_BLAST_SUMMARY_MAX)}\n` +
      `changed_symbols: ${symbols.join(', ') || '(none)'}`;
    if (st.callers) {
      const callerFiles = [
        ...new Set(b.downstream.flatMap((d) => d.callers.map((c) => c.file))),
      ].slice(0, BRIEF_BLAST_CALLER_FILES_MAX);
      text += `\ncaller_files:\n${callerFiles.map((f) => `- ${f}`).join('\n') || '(none)'}`;
    }
    blocks.push({ label: 'blast', text });
  }

  const shown = rankedFiles.slice(0, st.fileCount);
  const fileLines = shown.map((f) => {
    const hunks = st.hunksPerFile > 0 ? formatRanges(f.hunks, st.hunksPerFile) : '';
    return `${f.path} | +${f.additions} -${f.deletions} | ${f.role}${hunks ? ` | hunks ${hunks}` : ''}`;
  });
  blocks.push({
    label: 'files',
    text: `total_files: ${input.totalFiles} (showing ${shown.length})\n${fileLines.join('\n')}`,
  });

  if (st.findings && input.findings.length > 0) {
    blocks.push({
      label: 'findings',
      text: input.findings
        .slice(0, BRIEF_FINDINGS_MAX)
        .map((f) => `${f.file}:${f.line} ${f.severity}`)
        .join('\n'),
    });
  }

  if (st.specs) {
    for (const doc of input.specs) {
      blocks.push({ label: `spec:${sanitizeLabel(doc.path)}`, text: cap(doc.content, BRIEF_SPEC_DOC_MAX) });
    }
  }
  return blocks;
}

const totalChars = (blocks: BriefFactBlock[]): number =>
  blocks.reduce((n, b) => n + b.text.length, 0);

/**
 * Build the fact blocks under the S-8 caps, then enforce the total budget by
 * dropping components in `BRIEF_DROP_ORDER`. Reports what was dropped and the
 * resulting `data_gaps` (merged with `initialGaps`, de-duplicated).
 */
export function buildBriefFacts(input: BriefFactsInput, initialGaps: BriefDataGap[]): BriefFacts {
  const gaps = new Set<BriefDataGap>(initialGaps);
  const dropped: BriefDroppedComponent[] = [];

  const rankedFiles = [...input.files].sort(
    (a, b) => b.additions + b.deletions - (a.additions + a.deletions) || a.path.localeCompare(b.path),
  );

  const st: FactsState = {
    specs: input.specs.length > 0,
    hunksPerFile: BRIEF_HUNKS_PER_FILE_MAX,
    findings: input.findings.length > 0,
    callers: true,
    fileCount: Math.min(rankedFiles.length, BRIEF_FILES_MAX),
  };

  if (input.totalFiles > st.fileCount) gaps.add('files_truncated');
  if (rankedFiles.slice(0, st.fileCount).some((f) => f.hunks.length > BRIEF_HUNKS_PER_FILE_MAX)) {
    gaps.add('hunks_truncated');
  }
  if (rankedFiles.slice(0, st.fileCount).some((f) => f.hunks.length === 0)) {
    gaps.add('hunks_truncated'); // null/empty patch (or no new-side hunks): nothing to cite
  }
  if (input.findings.length > BRIEF_FINDINGS_MAX) gaps.add('findings');

  let blocks = renderBlocks(input, rankedFiles, st);

  for (const step of BRIEF_DROP_ORDER) {
    if (totalChars(blocks) <= BRIEF_FACTS_MAX_CHARS) break;
    let applied = false;
    switch (step) {
      case 'specs':
        if (st.specs) {
          st.specs = false;
          gaps.add('specs');
          applied = true;
        }
        break;
      case 'hunks':
        if (st.hunksPerFile > 0 && rankedFiles.some((f) => f.hunks.length > 0)) {
          st.hunksPerFile = 0;
          gaps.add('hunks_truncated');
          applied = true;
        }
        break;
      case 'findings':
        if (st.findings) {
          st.findings = false;
          gaps.add('findings');
          applied = true;
        }
        break;
      case 'callers':
        if (st.callers && input.blast && input.blast.downstream.some((d) => d.callers.length > 0)) {
          st.callers = false; // logged only: no gap, `blast` would wrongly read as absent
          applied = true;
        }
        break;
      case 'files': {
        const before = st.fileCount;
        blocks = renderBlocks(input, rankedFiles, st);
        while (st.fileCount > 0 && totalChars(blocks) > BRIEF_FACTS_MAX_CHARS) {
          st.fileCount = Math.max(0, st.fileCount - Math.max(1, Math.floor(st.fileCount / 4)));
          blocks = renderBlocks(input, rankedFiles, st);
        }
        if (st.fileCount < before) {
          gaps.add('files_truncated');
          applied = true;
        }
        break;
      }
    }
    if (applied) dropped.push(step);
    blocks = renderBlocks(input, rankedFiles, st);
  }

  return { blocks, factsChars: totalChars(blocks), dataGaps: [...gaps], dropped };
}
