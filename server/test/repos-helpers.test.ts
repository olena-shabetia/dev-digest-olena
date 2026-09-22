import { describe, it, expect } from 'vitest';
import { parseRepoUrl } from '../src/modules/repos/helpers.js';

describe('parseRepoUrl', () => {
  it('parses owner/repo from an https GitHub URL', () => {
    expect(parseRepoUrl('https://github.com/acme/widgets')).toEqual({
      owner: 'acme',
      name: 'widgets',
    });
  });
});
