/**
 * Pure helpers for the blast module — the frozen mapping algorithm from
 * `plans/L04-blast-radius.md` §3 / `server/specs/L04-blast-radius.api.md`.
 * No I/O; structurally typed against the facade's `BlastResult` rather than
 * importing `../repo-intel/types.js` (even as `import type`) — the
 * dependency-cruiser config counts type-only edges too
 * (server/INSIGHTS.md 2026-09-21), so a local structural type mirrors
 * `intent/helpers.ts`'s `PrIntentRowLike` pattern instead.
 */
import type { BlastRadiusResponse, BlastStats, DownstreamImpact } from '@devdigest/shared';

/** Structural mirror of `repo-intel/types.ts`'s `BlastResult`, field-for-field. */
export interface BlastResultInput {
  changedSymbols: { file: string; name: string; kind: string }[];
  callers: { file: string; symbol: string; viaSymbol: string; line: number; rank: number }[];
  impactedEndpoints: string[];
  factsByFile?: Record<string, { endpoints: string[]; crons: string[] }>;
  degraded?: boolean;
  reason?: BlastRadiusResponse['reason'] | undefined;
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

/** Builds the plain-English summary string (§3 step 7). No model call. */
export function buildBlastSummary(stats: BlastStats): string {
  return `${stats.symbols} changed symbol(s), ${stats.callers} caller(s), ${stats.endpoints} endpoint(s), ${stats.crons} cron job(s)`;
}

/** Implements the frozen mapping algorithm (plan §3, steps 1-8). */
export function toBlastRadiusResponse(input: BlastResultInput): BlastRadiusResponse {
  const changed_symbols = input.changedSymbols.map(({ name, file, kind }) => ({ name, file, kind }));

  // The declaring file(s) of each changed symbol name — a caller row whose
  // file matches is a same-file use, not a cross-file blast-radius impact.
  // The facade already excludes these in practice (the persistent path's
  // resolution requires an import edge, which a file never has to itself;
  // the ripgrep fallback checks explicitly), but this module doesn't control
  // that upstream behavior, so it re-asserts the invariant defensively.
  const declFilesByName = new Map<string, Set<string>>();
  for (const s of input.changedSymbols) {
    let files = declFilesByName.get(s.name);
    if (!files) {
      files = new Set();
      declFilesByName.set(s.name, files);
    }
    files.add(s.file);
  }

  // Step 2: group callers by viaSymbol, keeping first-seen group order and
  // within-group input order (the facade already sorts by rank descending).
  const groupOrder: string[] = [];
  const groups = new Map<string, BlastResultInput['callers']>();
  for (const row of input.callers) {
    if (declFilesByName.get(row.viaSymbol)?.has(row.file)) continue;
    let rows = groups.get(row.viaSymbol);
    if (!rows) {
      rows = [];
      groups.set(row.viaSymbol, rows);
      groupOrder.push(row.viaSymbol);
    }
    rows.push(row);
  }

  const factsByFile = input.factsByFile ?? {};

  const downstreamUnsorted: DownstreamImpact[] = groupOrder.map((symbol) => {
    const rows = groups.get(symbol)!;
    const endpoints_affected = sortedUnique(rows.flatMap((r) => factsByFile[r.file]?.endpoints ?? []));
    const crons_affected = sortedUnique(rows.flatMap((r) => factsByFile[r.file]?.crons ?? []));
    return {
      symbol,
      callers: rows.map((r) => ({ name: r.symbol, file: r.file, line: r.line })),
      endpoints_affected,
      crons_affected,
    };
  });

  // Step 3: sort by callers.length descending, then symbol ascending.
  const downstream = [...downstreamUnsorted].sort((a, b) => {
    if (b.callers.length !== a.callers.length) return b.callers.length - a.callers.length;
    return a.symbol.localeCompare(b.symbol);
  });

  // Step 4: endpoints/crons unions.
  const endpoints = sortedUnique([
    ...input.impactedEndpoints,
    ...downstream.flatMap((d) => d.endpoints_affected),
  ]);
  const crons = sortedUnique(downstream.flatMap((d) => d.crons_affected));

  // Step 5: facts_by_file restricted to distinct caller files present in
  // factsByFile — derived from `downstream` (post self-file exclusion), not
  // the raw input, so a file that was only ever a same-file "caller" doesn't
  // leak in here either.
  const callerFiles = new Set(downstream.flatMap((d) => d.callers.map((c) => c.file)));
  const facts_by_file: BlastRadiusResponse['facts_by_file'] = {};
  for (const [file, facts] of Object.entries(factsByFile)) {
    if (!callerFiles.has(file)) continue;
    facts_by_file[file] = { endpoints: [...facts.endpoints], crons: [...facts.crons] };
  }

  // Step 6: stats.
  const stats: BlastStats = {
    symbols: changed_symbols.length,
    callers: downstream.reduce((sum, d) => sum + d.callers.length, 0),
    endpoints: endpoints.length,
    crons: crons.length,
  };

  const summary = buildBlastSummary(stats);

  // Step 8: degraded/reason.
  const degraded = input.degraded === true;
  const reason = degraded ? (input.reason ?? 'no_data') : null;

  return {
    changed_symbols,
    downstream,
    summary,
    endpoints,
    crons,
    facts_by_file,
    stats,
    degraded,
    reason,
  };
}
