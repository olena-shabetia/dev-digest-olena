/**
 * P3 — hermetic tests for `pr-history/service.ts`. A stub `Container` is
 * cast `as unknown as Container` (blast-service.test.ts's pattern): no DB,
 * no real GitHub client, just `vi.fn()`s.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Container } from '../src/platform/container.js';
import { NotFoundError } from '../src/platform/errors.js';
import { PrHistoryService } from '../src/modules/pr-history/service.js';

function makeContainer(overrides: {
  getPull: ReturnType<typeof vi.fn>;
  getPrFiles: ReturnType<typeof vi.fn>;
  getRepo: ReturnType<typeof vi.fn>;
  github: ReturnType<typeof vi.fn>;
}): Container {
  return {
    reviewRepo: {
      getPull: overrides.getPull,
      getPrFiles: overrides.getPrFiles,
      getRepo: overrides.getRepo,
    },
    github: overrides.github,
  } as unknown as Container;
}

const REPO = { owner: 'acme', name: 'widgets' };

describe('PrHistoryService', () => {
  it('rejects with NotFoundError when the pull is missing (workspace-scoped miss)', async () => {
    const getPull = vi.fn().mockResolvedValue(undefined);
    const getPrFiles = vi.fn();
    const getRepo = vi.fn();
    const github = vi.fn();
    const service = new PrHistoryService(makeContainer({ getPull, getPrFiles, getRepo, github }));

    await expect(service.getPrHistory('ws-1', 'pr-1')).rejects.toBeInstanceOf(NotFoundError);
    expect(getPrFiles).not.toHaveBeenCalled();
  });

  it('returns an empty history without calling GitHub when the PR changed no files', async () => {
    const getPull = vi.fn().mockResolvedValue({ id: 'pr-1', repoId: 'repo-1', number: 10 });
    const getPrFiles = vi.fn().mockResolvedValue([]);
    const getRepo = vi.fn();
    const github = vi.fn();
    const service = new PrHistoryService(makeContainer({ getPull, getPrFiles, getRepo, github }));

    const result = await service.getPrHistory('ws-1', 'pr-1');

    expect(result).toEqual({ history: [] });
    expect(getRepo).not.toHaveBeenCalled();
    expect(github).not.toHaveBeenCalled();
  });

  it('finds a merged prior PR that overlaps files, excludes the current PR, and builds notes', async () => {
    const getPull = vi.fn().mockResolvedValue({ id: 'pr-1', repoId: 'repo-1', number: 10 });
    const getPrFiles = vi.fn().mockResolvedValue([{ path: 'src/a.ts' }, { path: 'src/b.ts' }]);
    const getRepo = vi.fn().mockResolvedValue(REPO);
    const listPullRequests = vi.fn().mockResolvedValue([
      { number: 10, status: 'open' }, // the current PR — must be excluded even though open
      { number: 9, status: 'merged', title: 'Fix a', author: 'alice', merged_at: '2026-01-02T00:00:00Z' },
      { number: 8, status: 'closed', title: 'Abandoned' }, // closed, not merged — excluded
    ]);
    const getPullRequest = vi.fn().mockResolvedValue({
      files: [{ path: 'src/a.ts' }, { path: 'src/z.ts' }],
    });
    const github = vi.fn().mockResolvedValue({ listPullRequests, getPullRequest });
    const service = new PrHistoryService(makeContainer({ getPull, getPrFiles, getRepo, github }));

    const result = await service.getPrHistory('ws-1', 'pr-1');

    expect(result.history).toEqual([
      {
        pr_number: 9,
        title: 'Fix a',
        merged_at: '2026-01-02T00:00:00Z',
        author: 'alice',
        files_overlap: ['src/a.ts'],
        notes: '1 of 2 changed file(s) overlap',
      },
    ]);
    expect(getPullRequest).toHaveBeenCalledTimes(1);
    expect(getPullRequest).toHaveBeenCalledWith(REPO, 9);
  });

  it('skips a merged candidate whose files do not overlap at all', async () => {
    const getPull = vi.fn().mockResolvedValue({ id: 'pr-1', repoId: 'repo-1', number: 10 });
    const getPrFiles = vi.fn().mockResolvedValue([{ path: 'src/a.ts' }]);
    const getRepo = vi.fn().mockResolvedValue(REPO);
    const listPullRequests = vi
      .fn()
      .mockResolvedValue([{ number: 9, status: 'merged', title: 'Unrelated', author: 'bob' }]);
    const getPullRequest = vi.fn().mockResolvedValue({ files: [{ path: 'src/other.ts' }] });
    const github = vi.fn().mockResolvedValue({ listPullRequests, getPullRequest });
    const service = new PrHistoryService(makeContainer({ getPull, getPrFiles, getRepo, github }));

    const result = await service.getPrHistory('ws-1', 'pr-1');

    expect(result.history).toEqual([]);
  });

  it('degrades to an empty history without rejecting when GitHub is unavailable (best-effort)', async () => {
    const getPull = vi.fn().mockResolvedValue({ id: 'pr-1', repoId: 'repo-1', number: 10 });
    const getPrFiles = vi.fn().mockResolvedValue([{ path: 'src/a.ts' }]);
    const getRepo = vi.fn().mockResolvedValue(REPO);
    const github = vi.fn().mockRejectedValue(new Error('no token configured'));
    const service = new PrHistoryService(makeContainer({ getPull, getPrFiles, getRepo, github }));

    const result = await service.getPrHistory('ws-1', 'pr-1');

    expect(result).toEqual({ history: [] });
  });

  it('returns an empty history when the repo row is missing', async () => {
    const getPull = vi.fn().mockResolvedValue({ id: 'pr-1', repoId: 'repo-1', number: 10 });
    const getPrFiles = vi.fn().mockResolvedValue([{ path: 'src/a.ts' }]);
    const getRepo = vi.fn().mockResolvedValue(undefined);
    const github = vi.fn();
    const service = new PrHistoryService(makeContainer({ getPull, getPrFiles, getRepo, github }));

    const result = await service.getPrHistory('ws-1', 'pr-1');

    expect(result).toEqual({ history: [] });
    expect(github).not.toHaveBeenCalled();
  });
});
