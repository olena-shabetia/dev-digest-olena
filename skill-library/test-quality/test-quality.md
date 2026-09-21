---
name: test-quality
description: >-
  Flags a PR whose new or changed test only exercises the happy path for a
  function with 2+ branches, leaving an error path or boundary condition
  unverified. For a Test Quality Reviewer agent.
type: convention
---

# Test Quality: Happy-Path-Only Coverage

A changed test file is a defect if the function(s) it targets have more
than one execution branch (an `if`/`else`, an early return, a `throw`, a
loop boundary, a nullable input) and the suite only drives the branch that
succeeds. A missing error/edge branch is the branch most likely to
regress silently, because nothing fails when it breaks.

## How to detect it

1. Read the function(s) under test. Enumerate its branches: every
   `if`/`else`/`switch` arm, early `return`/`throw`, loop zero/one/many
   boundary, nullable/optional parameter.
2. Read the new/changed test file. Enumerate which branches each case
   actually drives (trace the input to the branch it hits).
3. Diff the two lists. Any branch with no corresponding case is a gap.
   Prioritize an uncaught error path or an off-by-one boundary (empty
   array, zero, exactly the limit, limit+1).
4. Don't flag branches unreachable from the public API, or defensive code
   already covered by an exhaustive-switch type guarantee.

## Bad

```ts
export function applyDiscount(price: number, code: string): number {
  if (price < 0) throw new Error('price must be non-negative');
  if (code === 'HALF') return price / 2;
  if (code === 'FREE') return 0;
  return price; // unknown code: no discount
}
```
```ts
test('applies HALF discount', () => {
  expect(applyDiscount(100, 'HALF')).toBe(50);
});
```
Three branches (negative price throws, FREE, unknown code) are untested.
If a future edit breaks the negative-price guard, this suite stays green.

## Good

```ts
test('applies FREE discount', () => {
  expect(applyDiscount(100, 'FREE')).toBe(0);
});
test('returns full price for an unknown code', () => {
  expect(applyDiscount(100, 'BOGUS')).toBe(100);
});
test('throws on a negative price', () => {
  expect(() => applyDiscount(-1, 'HALF')).toThrow('non-negative');
});
```
Every branch — including the error path and the fallback — has a case
that would fail if its logic broke.

## Reporting

- Cite the exact `file:line` of the untested branch and name which input
  would exercise it.
- Severity: an untested error path or off-by-one on externally-reachable
  input is at minimum WARNING; on security- or money-relevant code
  (auth, payment, permissions) it is CRITICAL.
- Don't demand 100% branch coverage as a blanket rule — flag the specific
  missing branch and why it matters, not "add more tests."
