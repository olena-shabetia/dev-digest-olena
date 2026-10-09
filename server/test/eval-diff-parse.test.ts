import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff } from '../src/platform/diff.js';

/** Characterization of adapters/git/diff-parser.ts (plan D-11). */
describe('parseUnifiedDiff characterization', () => {
  it('(a) @@ counts too large are ignored when the body has lines', () => {
    const d = parseUnifiedDiff('diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,2 +1,50 @@\n+a\n+b');
    expect(d.files).toHaveLength(1);
    expect(d.files[0]!.path).toBe('x');
    expect(d.files[0]!.hunks[0]!.newLineNumbers).toEqual([1, 2]);
  });

  it('(b) @@ counts too small are ignored when the body has lines', () => {
    const d = parseUnifiedDiff('diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,1 +1,1 @@\n+a\n+b\n+c');
    expect(d.files[0]!.hunks[0]!.newLineNumbers).toEqual([1, 2, 3]);
  });

  it('(c) a header with no body lines yields an empty newLineNumbers', () => {
    const d = parseUnifiedDiff('diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,2 +5,3 @@');
    expect(d.files).toHaveLength(1);
    expect(d.files[0]!.hunks).toHaveLength(1);
    expect(d.files[0]!.hunks[0]!.newStart).toBe(5);
    expect(d.files[0]!.hunks[0]!.newLines).toBe(3);
    expect(d.files[0]!.hunks[0]!.newLineNumbers).toEqual([]);
  });

  it('(d) a trailing newline adds one extra covered line', () => {
    const base = 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,1 +1,2 @@\n+a\n+b';
    expect(parseUnifiedDiff(base).files[0]!.hunks[0]!.newLineNumbers).toEqual([1, 2]);
    expect(parseUnifiedDiff(base + '\n').files[0]!.hunks[0]!.newLineNumbers).toEqual([1, 2, 3]);
  });

  it('(e) a "\\ No newline at end of file" line counts as a context line', () => {
    const d = parseUnifiedDiff(
      'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,1 +1,2 @@\n+a\n\\ No newline at end of file',
    );
    expect(d.files[0]!.hunks[0]!.newLineNumbers).toEqual([1, 2]);
  });

  it('(f) hunks with no +++ line yield zero files', () => {
    const d = parseUnifiedDiff('--- a/x\n@@ -1,1 +1,1 @@\n+a');
    expect(d.files).toHaveLength(0);
  });

  it('(g) two diff --git blocks yield two file entries', () => {
    const d = parseUnifiedDiff(
      'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,1 +1,1 @@\n+a\ndiff --git a/y b/y\n--- a/y\n+++ b/y\n@@ -3,1 +3,1 @@\n+b',
    );
    expect(d.files.map((f) => f.path)).toEqual(['x', 'y']);
    expect(d.files[0]!.hunks[0]!.newLineNumbers).toEqual([1]);
    expect(d.files[1]!.hunks[0]!.newLineNumbers).toEqual([3]);
  });

  it('(h) a +++ b/x header without diff --git yields one file', () => {
    const d = parseUnifiedDiff('--- a/x\n+++ b/x\n@@ -1,1 +1,2 @@\n+a\n+b');
    expect(d.files).toHaveLength(1);
    expect(d.files[0]!.path).toBe('x');
    expect(d.files[0]!.hunks[0]!.newLineNumbers).toEqual([1, 2]);
  });

  it('(i) two bare ---/+++ blocks with no diff --git merge into ONE file with the last path', () => {
    const d = parseUnifiedDiff(
      '--- a/first\n+++ b/first\n@@ -1,1 +1,1 @@\n+a\n--- a/second\n+++ b/second\n@@ -10,1 +10,1 @@\n+b',
    );
    expect(d.files).toHaveLength(1);
    expect(d.files[0]!.path).toBe('second');
    expect(d.files[0]!.hunks).toHaveLength(2);
    expect(d.files[0]!.hunks[0]!.newLineNumbers).toEqual([1]);
    expect(d.files[0]!.hunks[1]!.newLineNumbers).toEqual([10]);
  });
});
