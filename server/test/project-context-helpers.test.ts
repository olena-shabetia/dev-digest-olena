import { describe, expect, it } from 'vitest';
import { toSpecFileDto, usedByFor } from '../src/modules/project-context/helpers.js';
import type { DiscoveredDoc } from '../src/platform/project-context/index.js';

const doc: DiscoveredDoc = {
  path: 'specs/a.md',
  type: 'specs',
  size: 120,
  tokens: 30,
  truncated: false,
};

describe('project-context/helpers', () => {
  it('toSpecFileDto sets every declared key, with content null in the listing', () => {
    expect(toSpecFileDto(doc, 3)).toEqual({
      path: 'specs/a.md',
      content: null,
      size: 120,
      updated_at: null,
      type: 'specs',
      tokens: 30,
      truncated: false,
      used_by_agents: 3,
    });
  });

  it('toSpecFileDto carries the full content through for the preview route', () => {
    const dto = toSpecFileDto(doc, 0, '# hello');
    expect(dto.content).toBe('# hello');
    expect(dto.used_by_agents).toBe(0);
  });

  it('usedByFor defaults to 0 for a path with no usage-count entry', () => {
    const map = new Map<string, number>([['specs/other.md', 5]]);
    expect(usedByFor(map, 'specs/a.md')).toBe(0);
    expect(usedByFor(map, 'specs/other.md')).toBe(5);
  });
});
