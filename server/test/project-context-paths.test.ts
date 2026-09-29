import { describe, it, expect } from 'vitest';
import {
  isSafeDocPath,
  docTypeFor,
  capDocContent,
  estimateDocTokens,
} from '../src/platform/project-context/paths.js';

describe('isSafeDocPath', () => {
  it('accepts a plain repo-relative markdown path', () => {
    expect(isSafeDocPath('specs/a.md')).toBe(true);
    expect(isSafeDocPath('a/b/insights/c.md')).toBe(true);
  });

  it('rejects .. traversal, a leading /, and non-.md files', () => {
    expect(isSafeDocPath('specs/../secrets.md')).toBe(false);
    expect(isSafeDocPath('/etc/passwd.md')).toBe(false);
    expect(isSafeDocPath('specs/a.txt')).toBe(false);
  });

  it('rejects backslashes, quote/angle-bracket chars, and control characters', () => {
    expect(isSafeDocPath('specs\\a.md')).toBe(false);
    expect(isSafeDocPath('specs/a"b.md')).toBe(false);
    expect(isSafeDocPath('specs/a<b.md')).toBe(false);
    expect(isSafeDocPath('specs/a>b.md')).toBe(false);
    expect(isSafeDocPath('specs/a\nb.md')).toBe(false);
    expect(isSafeDocPath('specs/a\u0007b.md')).toBe(false);
    expect(isSafeDocPath('specs/a\u007fb.md')).toBe(false);
  });

  it('rejects empty and dot segments', () => {
    expect(isSafeDocPath('')).toBe(false);
    expect(isSafeDocPath('specs//a.md')).toBe(false);
    expect(isSafeDocPath('./specs/a.md')).toBe(false);
    expect(isSafeDocPath('specs/./a.md')).toBe(false);
  });
});

describe('docTypeFor', () => {
  it('derives the type from the first matching root segment', () => {
    expect(docTypeFor('specs/a.md')).toBe('specs');
    expect(docTypeFor('docs/a.md')).toBe('docs');
    expect(docTypeFor('insights/a.md')).toBe('insights');
  });

  it('uses the FIRST matching segment when nested', () => {
    expect(docTypeFor('docs/specs/x.md')).toBe('docs');
    expect(docTypeFor('a/insights/b/specs/c.md')).toBe('insights');
  });

  it('returns null when no segment matches', () => {
    expect(docTypeFor('readme/a.md')).toBeNull();
  });
});

describe('capDocContent', () => {
  it('leaves content under the cap untouched', () => {
    const content = 'x'.repeat(12_000);
    const result = capDocContent(content);
    expect(result.truncated).toBe(false);
    expect(result.content).toBe(content);
    expect(result.originalChars).toBe(12_000);
  });

  it('truncates content over the cap with the exact marker text', () => {
    const content = 'x'.repeat(12_001);
    const result = capDocContent(content);
    expect(result.truncated).toBe(true);
    expect(result.originalChars).toBe(12_001);
    expect(result.content).toBe(
      'x'.repeat(12_000) + '\n[truncated: showing 12,000 of 12,001 characters]',
    );
  });
});

describe('estimateDocTokens', () => {
  it('is ceil(min(chars, 12000) / 4)', () => {
    expect(estimateDocTokens(0)).toBe(0);
    expect(estimateDocTokens(4)).toBe(1);
    expect(estimateDocTokens(5)).toBe(2);
    expect(estimateDocTokens(12_000)).toBe(3_000);
    expect(estimateDocTokens(50_000)).toBe(3_000);
  });
});
