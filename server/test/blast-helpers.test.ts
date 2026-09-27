/**
 * L04 — pure mapping-algorithm tests for `blast/helpers.ts`, written before
 * the module exists (server/specs/L04-blast-radius.api.md's test list).
 * Covers the frozen mapping algorithm (plan §3): grouping by `viaSymbol`,
 * sort order, per-symbol endpoint/cron attribution, `facts_by_file`
 * restricted to caller files, `stats`, the exact `summary` string and the
 * `degraded`/`reason` rules.
 */
import { describe, it, expect } from 'vitest';
import { toBlastRadiusResponse, buildBlastSummary, type BlastResultInput } from '../src/modules/blast/helpers.js';

describe('toBlastRadiusResponse', () => {
  it('maps a persistent-path input: grouping, sort order, per-symbol facts, stats and summary', () => {
    const input: BlastResultInput = {
      changedSymbols: [
        { file: 'src/a.ts', name: 'foo', kind: 'function' },
        { file: 'src/a.ts', name: 'bar', kind: 'function' },
      ],
      callers: [
        { file: 'src/routes/x.ts', symbol: 'handlerX', viaSymbol: 'foo', line: 10, rank: 5 },
        { file: 'src/routes/y.ts', symbol: 'handlerY', viaSymbol: 'foo', line: 20, rank: 3 },
        { file: 'src/cron/z.ts', symbol: 'jobZ', viaSymbol: 'bar', line: 1, rank: 1 },
      ],
      impactedEndpoints: ['GET /x'],
      factsByFile: {
        'src/routes/x.ts': { endpoints: ['GET /x'], crons: [] },
        'src/routes/y.ts': { endpoints: ['GET /y'], crons: [] },
        'src/cron/z.ts': { endpoints: [], crons: ['job:z'] },
      },
      degraded: false,
    };

    const result = toBlastRadiusResponse(input);

    expect(result.changed_symbols).toEqual([
      { name: 'foo', file: 'src/a.ts', kind: 'function' },
      { name: 'bar', file: 'src/a.ts', kind: 'function' },
    ]);

    // `foo` has 2 callers, `bar` has 1 -> foo sorts first (callers.length desc).
    expect(result.downstream.map((d) => d.symbol)).toEqual(['foo', 'bar']);

    const fooGroup = result.downstream.find((d) => d.symbol === 'foo')!;
    expect(fooGroup.callers).toEqual([
      { name: 'handlerX', file: 'src/routes/x.ts', line: 10 },
      { name: 'handlerY', file: 'src/routes/y.ts', line: 20 },
    ]);
    expect(fooGroup.endpoints_affected).toEqual(['GET /x', 'GET /y']);
    expect(fooGroup.crons_affected).toEqual([]);

    const barGroup = result.downstream.find((d) => d.symbol === 'bar')!;
    expect(barGroup.callers).toEqual([{ name: 'jobZ', file: 'src/cron/z.ts', line: 1 }]);
    expect(barGroup.endpoints_affected).toEqual([]);
    expect(barGroup.crons_affected).toEqual(['job:z']);

    expect(result.facts_by_file).toEqual({
      'src/routes/x.ts': { endpoints: ['GET /x'], crons: [] },
      'src/routes/y.ts': { endpoints: ['GET /y'], crons: [] },
      'src/cron/z.ts': { endpoints: [], crons: ['job:z'] },
    });

    expect(result.endpoints).toEqual(['GET /x', 'GET /y']);
    expect(result.crons).toEqual(['job:z']);

    expect(result.stats).toEqual({ symbols: 2, callers: 3, endpoints: 2, crons: 1 });
    expect(result.summary).toBe('2 changed symbol(s), 3 caller(s), 2 endpoint(s), 1 cron job(s)');
    expect(result.degraded).toBe(false);
    expect(result.reason).toBeNull();
  });

  it('excludes a caller row whose file is the same file the changed symbol is declared in', () => {
    const input: BlastResultInput = {
      changedSymbols: [{ file: 'src/a.ts', name: 'foo', kind: 'function' }],
      callers: [
        // same-file "caller" — must not appear as a downstream caller.
        { file: 'src/a.ts', symbol: 'siblingInSameFile', viaSymbol: 'foo', line: 5, rank: 9 },
        // genuine cross-file caller — must survive.
        { file: 'src/routes/x.ts', symbol: 'handlerX', viaSymbol: 'foo', line: 10, rank: 5 },
      ],
      impactedEndpoints: [],
      factsByFile: {
        'src/a.ts': { endpoints: ['GET /should-not-appear'], crons: [] },
        'src/routes/x.ts': { endpoints: ['GET /x'], crons: [] },
      },
      degraded: false,
    };

    const result = toBlastRadiusResponse(input);

    expect(result.downstream).toHaveLength(1);
    expect(result.downstream[0]!.callers).toEqual([{ name: 'handlerX', file: 'src/routes/x.ts', line: 10 }]);
    expect(result.stats.callers).toBe(1);
    // The declaring file's own facts must not leak in via facts_by_file either.
    expect(result.facts_by_file).toEqual({ 'src/routes/x.ts': { endpoints: ['GET /x'], crons: [] } });
  });

  it('excludes factsByFile entries for files that are not a caller of any changed symbol', () => {
    const input: BlastResultInput = {
      changedSymbols: [{ file: 'src/a.ts', name: 'foo', kind: 'function' }],
      callers: [{ file: 'src/routes/x.ts', symbol: 'handlerX', viaSymbol: 'foo', line: 10, rank: 5 }],
      impactedEndpoints: ['GET /x'],
      factsByFile: {
        'src/routes/x.ts': { endpoints: ['GET /x'], crons: [] },
        'src/routes/dropped.ts': { endpoints: ['GET /dropped'], crons: ['job:dropped'] },
      },
      degraded: false,
    };

    const result = toBlastRadiusResponse(input);

    expect(result.facts_by_file).toEqual({
      'src/routes/x.ts': { endpoints: ['GET /x'], crons: [] },
    });
  });

  it('maps a degraded ripgrep-shaped input with no factsByFile: per-symbol facts empty, top-level endpoints from impactedEndpoints', () => {
    const input: BlastResultInput = {
      changedSymbols: [{ file: 'src/a.ts', name: 'foo', kind: 'function' }],
      callers: [{ file: 'src/routes/x.ts', symbol: 'handlerX', viaSymbol: 'foo', line: 10, rank: 0 }],
      impactedEndpoints: ['GET /x', 'POST /y'],
      degraded: true,
      reason: 'no_data',
    };

    const result = toBlastRadiusResponse(input);

    expect(result.downstream).toHaveLength(1);
    expect(result.downstream[0]!.endpoints_affected).toEqual([]);
    expect(result.downstream[0]!.crons_affected).toEqual([]);
    expect(result.endpoints).toEqual(['GET /x', 'POST /y']);
    expect(result.facts_by_file).toEqual({});
    expect(result.degraded).toBe(true);
    expect(result.reason).toBe('no_data');
  });

  it('defaults reason to no_data when degraded is true and no reason is given', () => {
    const input: BlastResultInput = {
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: true,
    };

    const result = toBlastRadiusResponse(input);
    expect(result.degraded).toBe(true);
    expect(result.reason).toBe('no_data');
  });

  it('an all-empty, non-degraded input yields zero stats, empty downstream and a null reason', () => {
    const input: BlastResultInput = {
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: false,
    };

    const result = toBlastRadiusResponse(input);
    expect(result.changed_symbols).toEqual([]);
    expect(result.downstream).toEqual([]);
    expect(result.endpoints).toEqual([]);
    expect(result.crons).toEqual([]);
    expect(result.facts_by_file).toEqual({});
    expect(result.stats).toEqual({ symbols: 0, callers: 0, endpoints: 0, crons: 0 });
    expect(result.summary).toBe('0 changed symbol(s), 0 caller(s), 0 endpoint(s), 0 cron job(s)');
    expect(result.degraded).toBe(false);
    expect(result.reason).toBeNull();
  });
});

describe('buildBlastSummary', () => {
  it('builds the plain-English summary string from stats', () => {
    expect(buildBlastSummary({ symbols: 3, callers: 5, endpoints: 2, crons: 0 })).toBe(
      '3 changed symbol(s), 5 caller(s), 2 endpoint(s), 0 cron job(s)',
    );
  });
});
