import type { RepoIntel } from '../../src/modules/repo-intel/types.js';

/**
 * Minimal `RepoIntel` stub for tests that only need `getTopFilesByRank` (the
 * conventions extractor's only real dependency on repo-intel) to return a
 * fixed, ranked file list — every other method is a degraded no-op so tests
 * for OTHER features accidentally exercising this stub don't crash.
 */
export function makeRepoIntelStub(opts: { rankedPaths?: string[]; throwOnRank?: boolean } = {}): RepoIntel {
  return {
    indexRepo: async () => ({ status: 'degraded', filesIndexed: 0, filesSkipped: 0, durationMs: 0 }),
    refreshIndex: async () => ({ status: 'degraded', filesIndexed: 0, filesSkipped: 0, durationMs: 0 }),
    getIndexState: async (repoId: string) => ({
      repoId,
      status: 'degraded',
      filesIndexed: 0,
      filesSkipped: 0,
      durationMs: 0,
      lastIndexedSha: '',
      indexerVersion: 1,
      updatedAt: new Date(0),
      degraded: true,
    }),
    getBlastRadius: async () => ({ changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true }),
    getRepoMap: async () => ({ text: '', tokens: 0, cached: false, degraded: true }),
    getFileRank: async () => [],
    getSymbolsInFiles: async () => [],
    getCallerSignatures: async () => [],
    getUnresolvedReferences: async () => [],
    getConventionSamples: async (_repoId: string, n: number) => (opts.rankedPaths ?? []).slice(0, n),
    getTopFilesByRank: async (_repoId: string, n: number) => {
      if (opts.throwOnRank) throw new Error('repo-intel unavailable');
      return (opts.rankedPaths ?? []).slice(0, n);
    },
    getCriticalPaths: async () => [],
  };
}
