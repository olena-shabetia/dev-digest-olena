/**
 * Clone I/O for the conventions extractor — deterministic, no LLM.
 * `readClone` is module-private in `repo-intel/service.ts`; copied here
 * (3 lines) rather than importing across modules (server/AGENTS.md,
 * server/INSIGHTS.md — no-cross-module-imports, even for a 3-line helper).
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CONFIG_FILE_CANDIDATES, MAX_FILE_LINES, MAX_FILES_PER_TOP_LEVEL_DIR } from './constants.js';
import type { SampledFile } from './types.js';
import { normalizeRelPath } from './helpers.js';

async function readClone(clonePath: string, file: string): Promise<string | null> {
  return readFile(join(clonePath, file), 'utf8').catch(() => null);
}

/** Read + clamp one clone-relative file to `MAX_FILE_LINES`. Returns `null`
 *  when the file doesn't exist / can't be read (never throws). */
export async function readCloneFile(clonePath: string, path: string): Promise<SampledFile | null> {
  const content = await readClone(clonePath, path);
  if (content == null) return null;
  return { path: normalizeRelPath(path), lines: clampFile(content) };
}

/** Clamp a file's content to at most `MAX_FILE_LINES` lines. */
export function clampFile(content: string, maxLines: number = MAX_FILE_LINES): string[] {
  return content.split(/\r?\n/).slice(0, maxLines);
}

/** Read every config file in `CONFIG_FILE_CANDIDATES` that exists at the
 *  clone root — no glob resolution, just literal-name probes. */
export async function readConfigSamples(clonePath: string): Promise<SampledFile[]> {
  const out: SampledFile[] = [];
  for (const name of CONFIG_FILE_CANDIDATES) {
    const sample = await readCloneFile(clonePath, name);
    if (sample) out.push(sample);
  }
  return out;
}

/** Render a sampled file's lines with 1-based gutter line numbers — what
 *  makes the model's cited `evidence.line` checkable against real code. */
export function numberLines(lines: string[]): string {
  return lines.map((line, i) => `${i + 1}\t${line}`).join('\n');
}

/**
 * Diversify a rank-ordered path list to at most `MAX_FILES_PER_TOP_LEVEL_DIR`
 * per top-level directory before truncating to `limit` — so one hot module
 * can't monopolise the sample (quality booster, criterion-adjacent).
 */
export function diversifyByTopLevelDir(
  paths: string[],
  limit: number,
  maxPerDir: number = MAX_FILES_PER_TOP_LEVEL_DIR,
): string[] {
  const perDir = new Map<string, number>();
  const out: string[] = [];
  for (const p of paths) {
    if (out.length >= limit) break;
    const top = p.split('/')[0] ?? p;
    const count = perDir.get(top) ?? 0;
    if (count >= maxPerDir) continue;
    perDir.set(top, count + 1);
    out.push(p);
  }
  return out;
}
