import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listRepoDocs, readWorkingTreeDoc, ProjectDocPathError } from '../src/platform/project-context/discover.js';
import { PROJECT_CONTEXT_DEFAULT_GLOB } from '../src/platform/project-context/constants.js';

const GLOBS = [PROJECT_CONTEXT_DEFAULT_GLOB];

describe('listRepoDocs', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'devdigest-project-context-discover-'));

    await mkdir(join(root, 'specs'), { recursive: true });
    await writeFile(join(root, 'specs', 'a.md'), 'spec a');

    await mkdir(join(root, 'docs'), { recursive: true });
    await writeFile(join(root, 'docs', 'b.md'), 'doc b');

    await mkdir(join(root, 'nested', 'insights'), { recursive: true });
    await writeFile(join(root, 'nested', 'insights', 'c.md'), 'insight c');

    // Excluded roots — must never appear in the result.
    await mkdir(join(root, 'node_modules', 'specs'), { recursive: true });
    await writeFile(join(root, 'node_modules', 'specs', 'x.md'), 'nope');

    await mkdir(join(root, 'vendor', 'docs'), { recursive: true });
    await writeFile(join(root, 'vendor', 'docs', 'x.md'), 'nope');

    await mkdir(join(root, '.devdigest', 'specs'), { recursive: true });
    await writeFile(join(root, '.devdigest', 'specs', 'x.md'), 'nope');

    // Oversized file — stat-skipped, never read.
    await mkdir(join(root, 'specs', 'big'), { recursive: true });
    await writeFile(join(root, 'specs', 'big', 'huge.md'), 'y'.repeat(400 * 1024 + 1));

    // A doc over the 12,000-char cap — should come back truncated.
    await writeFile(join(root, 'specs', 'long.md'), 'z'.repeat(13 * 1024));

    // Symlink pointing outside root — must never be listed.
    const outside = await mkdtemp(join(tmpdir(), 'devdigest-project-context-outside-'));
    await writeFile(join(outside, 'external.md'), 'external');
    await symlink(join(outside, 'external.md'), join(root, 'specs', 'link.md'));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('finds docs under specs/docs/nested-insights roots, excludes vendored and dot dirs, flags an oversized truncated doc, and skips a symlink', async () => {
    const result = await listRepoDocs({ owner: 'acme', name: 'widgets', clonePath: root }, GLOBS);

    expect(result.status).toBe('ok');
    const paths = result.docs.map((d) => d.path).sort();
    expect(paths).toContain('specs/a.md');
    expect(paths).toContain('docs/b.md');
    expect(paths).toContain('nested/insights/c.md');
    expect(paths).toContain('specs/long.md');

    expect(paths).not.toContain('node_modules/specs/x.md');
    expect(paths).not.toContain('vendor/docs/x.md');
    expect(paths).not.toContain('.devdigest/specs/x.md');
    expect(paths).not.toContain('specs/big/huge.md');
    expect(paths).not.toContain('specs/link.md');

    const longDoc = result.docs.find((d) => d.path === 'specs/long.md');
    expect(longDoc?.truncated).toBe(true);
    expect(longDoc?.type).toBe('specs');

    const aDoc = result.docs.find((d) => d.path === 'specs/a.md');
    expect(aDoc?.truncated).toBe(false);
  });

  it('returns not_cloned when there is no clone on disk', async () => {
    const result = await listRepoDocs({ owner: 'acme', name: 'gone', clonePath: null }, GLOBS);
    expect(result.status).toBe('not_cloned');
    expect(result.docs).toEqual([]);
  });

  it('returns not_cloned when the clone path does not exist on disk', async () => {
    const result = await listRepoDocs(
      { owner: 'acme', name: 'missing', clonePath: join(root, 'does-not-exist') },
      GLOBS,
    );
    expect(result.status).toBe('not_cloned');
    expect(result.docs).toEqual([]);
  });
});

describe('readWorkingTreeDoc', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'devdigest-project-context-readwt-'));
    await mkdir(join(root, 'specs'), { recursive: true });
    await writeFile(join(root, 'specs', 'a.md'), 'hello');
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reads a safe, contained doc', async () => {
    const content = await readWorkingTreeDoc(root, 'specs/a.md');
    expect(content).toBe('hello');
  });

  it('throws ProjectDocPathError for an unsafe path', async () => {
    await expect(readWorkingTreeDoc(root, '../escape.md')).rejects.toThrow(ProjectDocPathError);
  });

  it('throws ProjectDocPathError for a path that does not exist', async () => {
    await expect(readWorkingTreeDoc(root, 'specs/missing.md')).rejects.toThrow(ProjectDocPathError);
  });
});
