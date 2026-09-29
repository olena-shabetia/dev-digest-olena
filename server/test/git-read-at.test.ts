import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';
import type { RepoRef } from '@devdigest/shared';

/**
 * Hermetic (no network) — a real local repo under a temp dir, exercised
 * through SimpleGitClient exactly as production code addresses it:
 * `cloneDir/<owner>/<name>`.
 */
describe('SimpleGitClient.hasCommit / readFileAt', () => {
  let tmpRoot: string;
  let cloneDir: string;
  const repo: RepoRef = { owner: 'acme', name: 'widgets' };
  let sha1 = '';
  let sha2 = '';
  let client: SimpleGitClient;

  beforeAll(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'devdigest-git-read-at-'));
    cloneDir = join(tmpRoot, 'clones');
    const repoPath = join(cloneDir, repo.owner, repo.name);
    await mkdir(join(repoPath, 'specs'), { recursive: true });

    const git = simpleGit(repoPath);
    await git.init();
    await git.addConfig('user.email', 'test@example.com');
    await git.addConfig('user.name', 'Test');

    await writeFile(join(repoPath, 'specs', 'a.md'), 'version one\n');
    await git.add('.');
    await git.commit('first version');
    sha1 = (await git.revparse(['HEAD'])).trim();

    await writeFile(join(repoPath, 'specs', 'a.md'), 'version two\n');
    // A symlink blob, so readFileAt returns the link text and never follows it.
    await symlink('a.md', join(repoPath, 'specs', 'link.md'));
    await git.add('.');
    await git.commit('second version + symlink');
    sha2 = (await git.revparse(['HEAD'])).trim();

    client = new SimpleGitClient(cloneDir);
  });

  afterAll(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it('reads the file content as of the first commit, not the working tree', async () => {
    const content = await client.readFileAt(repo, sha1, 'specs/a.md');
    expect(content).toBe('version one\n');
    // Working tree currently holds "version two" — confirm we did not read it.
    const head = await client.readFileAt(repo, sha2, 'specs/a.md');
    expect(head).toBe('version two\n');
  });

  it('resolves null for a path missing at that ref', async () => {
    const content = await client.readFileAt(repo, sha1, 'specs/does-not-exist.md');
    expect(content).toBeNull();
  });

  it('hasCommit is true for a real sha and false for a bogus one', async () => {
    expect(await client.hasCommit(repo, sha1)).toBe(true);
    expect(await client.hasCommit(repo, 'deadbeef')).toBe(false);
  });

  it('a symlink blob returns the link text, never the target content', async () => {
    const content = await client.readFileAt(repo, sha2, 'specs/link.md');
    expect(content).toBe('a.md');
  });
});
