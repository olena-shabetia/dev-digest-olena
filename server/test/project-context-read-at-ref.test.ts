import { describe, it, expect } from 'vitest';
import { MockGitClient } from '../src/adapters/mocks.js';
import { readProjectDocsAtRef } from '../src/platform/project-context/read-at-ref.js';

const repo = { owner: 'acme', name: 'widgets' };

describe('readProjectDocsAtRef', () => {
  it('reads docs in the given order and applies the cap/token estimate', async () => {
    const git = new MockGitClient({
      filesAtRef: { 'specs/a.md': 'hello', 'docs/b.md': 'world' },
    });

    const result = await readProjectDocsAtRef(git, repo, 'deadbeefcafe', 42, [
      'docs/b.md',
      'specs/a.md',
    ]);

    expect(result.status).toBe('ok');
    expect(result.skipped).toEqual([]);
    expect(result.docs.map((d) => d.path)).toEqual(['docs/b.md', 'specs/a.md']);
    expect(result.docs[0]).toMatchObject({ content: 'world', truncated: false });
    expect(result.docs[1]).toMatchObject({ content: 'hello', truncated: false });
    expect(git.fetchedPulls).toEqual([]);
  });

  it('skips a path missing at head and an unsafe path, preserving order for the rest', async () => {
    const git = new MockGitClient({ filesAtRef: { 'specs/a.md': 'hello' } });

    const result = await readProjectDocsAtRef(git, repo, 'deadbeefcafe', 1, [
      'specs/a.md',
      'specs/missing.md',
      '../escape.md',
    ]);

    expect(result.status).toBe('ok');
    expect(result.docs.map((d) => d.path)).toEqual(['specs/a.md']);
    expect(result.skipped).toEqual([
      { path: 'specs/missing.md', reason: 'missing_at_head' },
      { path: '../escape.md', reason: 'unsafe_path' },
    ]);
  });

  it('fetches the PR head once when unavailable, then reads once it becomes available', async () => {
    const git = new MockGitClient({
      headAvailable: false,
      headAvailableAfterFetch: true,
      filesAtRef: { 'specs/a.md': 'hello' },
    });

    const result = await readProjectDocsAtRef(git, repo, 'deadbeefcafe', 7, ['specs/a.md']);

    expect(result.status).toBe('ok');
    expect(result.docs.map((d) => d.path)).toEqual(['specs/a.md']);
    expect(git.fetchedPulls).toEqual([7]);
  });

  it('reports head_unavailable and never falls back to readFile when still unavailable after fetch', async () => {
    const git = new MockGitClient({
      headAvailable: false,
      headAvailableAfterFetch: false,
      filesAtRef: { 'specs/a.md': 'hello' },
    });

    const result = await readProjectDocsAtRef(git, repo, 'deadbeefcafe', 9, ['specs/a.md']);

    expect(result.status).toBe('head_unavailable');
    expect(result.docs).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(git.fetchedPulls).toEqual([9]);
  });

  it('caps an over-limit doc and reports the truncated flag + originalChars', async () => {
    const long = 'x'.repeat(12_001);
    const git = new MockGitClient({ filesAtRef: { 'specs/long.md': long } });

    const result = await readProjectDocsAtRef(git, repo, 'deadbeefcafe', 1, ['specs/long.md']);

    expect(result.docs[0].truncated).toBe(true);
    expect(result.docs[0].originalChars).toBe(12_001);
    expect(result.docs[0].tokens).toBe(3_000);
  });
});
