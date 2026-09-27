/**
 * L04 — hermetic tests for `blast/service.ts`. A stub `Container` is cast
 * `as unknown as Container` (server/specs/L03-smart-diff.api.md pattern):
 * no DB, no repo-intel, just `vi.fn()`s on `reviewRepo` and `repoIntel`.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Container } from '../src/platform/container.js';
import { NotFoundError } from '../src/platform/errors.js';
import { BlastService } from '../src/modules/blast/service.js';

function makeContainer(overrides: {
  getPull: ReturnType<typeof vi.fn>;
  getPrFiles: ReturnType<typeof vi.fn>;
  getBlastRadius: ReturnType<typeof vi.fn>;
}): Container {
  return {
    reviewRepo: {
      getPull: overrides.getPull,
      getPrFiles: overrides.getPrFiles,
    },
    repoIntel: {
      getBlastRadius: overrides.getBlastRadius,
    },
  } as unknown as Container;
}

describe('BlastService', () => {
  it('rejects with NotFoundError when the pull is missing (workspace-scoped miss)', async () => {
    const getPull = vi.fn().mockResolvedValue(undefined);
    const getPrFiles = vi.fn();
    const getBlastRadius = vi.fn();
    const service = new BlastService(makeContainer({ getPull, getPrFiles, getBlastRadius }));

    await expect(service.getBlastRadius('ws-1', 'pr-1')).rejects.toBeInstanceOf(NotFoundError);
    expect(getPrFiles).not.toHaveBeenCalled();
    expect(getBlastRadius).not.toHaveBeenCalled();
  });

  it('calls the facade exactly once with (repoId, paths) built from getPrFiles', async () => {
    const getPull = vi.fn().mockResolvedValue({ id: 'pr-1', repoId: 'repo-1' });
    const getPrFiles = vi.fn().mockResolvedValue([{ path: 'src/a.ts' }, { path: 'src/b.ts' }]);
    const getBlastRadius = vi.fn().mockResolvedValue({
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: false,
    });
    const service = new BlastService(makeContainer({ getPull, getPrFiles, getBlastRadius }));

    await service.getBlastRadius('ws-1', 'pr-1');

    expect(getBlastRadius).toHaveBeenCalledTimes(1);
    expect(getBlastRadius).toHaveBeenCalledWith('repo-1', ['src/a.ts', 'src/b.ts']);
  });

  it('degrades to index_failed without rejecting when the facade throws (best-effort)', async () => {
    const getPull = vi.fn().mockResolvedValue({ id: 'pr-1', repoId: 'repo-1' });
    const getPrFiles = vi.fn().mockResolvedValue([]);
    const getBlastRadius = vi.fn().mockRejectedValue(new Error('index unavailable'));
    const service = new BlastService(makeContainer({ getPull, getPrFiles, getBlastRadius }));

    const result = await service.getBlastRadius('ws-1', 'pr-1');

    expect(result.degraded).toBe(true);
    expect(result.reason).toBe('index_failed');
  });
});
