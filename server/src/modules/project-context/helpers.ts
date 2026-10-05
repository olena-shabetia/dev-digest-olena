/**
 * L05 — pure DTO mappers for the project-context module. No I/O, no Drizzle.
 */
import type { SpecFile } from '@devdigest/shared';
import type { DiscoveredDoc } from '../../platform/project-context/index.js';

/**
 * Maps a discovered doc (+ its live usage count) to the wire `SpecFile`
 * shape. Sets EVERY declared key (server/INSIGHTS.md 2026-09-21 — a schema
 * with a `response:` attached strips any undeclared field on the way out).
 * `content` is `null` in the listing (the default) and the full text only
 * when the caller passes it (the preview route).
 */
export function toSpecFileDto(doc: DiscoveredDoc, usedBy: number, content?: string): SpecFile {
  return {
    path: doc.path,
    content: content ?? null,
    size: doc.size,
    updated_at: null,
    type: doc.type,
    tokens: doc.tokens,
    truncated: doc.truncated,
    used_by_agents: usedBy,
  };
}

/** `0` when the path has no usage-count entry (not attached by anyone yet). */
export function usedByFor(map: Map<string, number>, path: string): number {
  return map.get(path) ?? 0;
}
