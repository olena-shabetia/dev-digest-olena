# Corner cases

Flag missing tests for inputs at the edges of a function's domain, not just
the common case the PR's own example covers.

## What to check
- **Empty input**: empty string, empty array/object, empty collection,
  zero-length buffer — is there a test for the empty case, and does the code
  even define correct behavior for it?
- **Boundary values**: 0, -1, 1, the exact upper/lower limit of a range (e.g.
  a pagination `limit`, an array's last valid index, a configured max), and
  one-past-the-boundary (limit + 1, index out of range).
- **Overflow / extreme values**: very large numbers, very long strings,
  `Number.MAX_SAFE_INTEGER`, huge arrays — anything that could overflow a
  counter, truncate silently, or blow up memory/time complexity.
- **Null / undefined**: optional fields, nullable DB columns, missing query
  params — is the "absent" case distinguished from the "present but falsy"
  case (`0`, `''`, `false`)?
- **Locale-sensitive behavior**: date/time formatting, string comparison or
  sorting, number formatting (decimal separators, thousands separators),
  casing (`toUpperCase`/`toLowerCase` on non-ASCII) — is there a test that
  isn't implicitly assuming the reviewer's own locale/timezone?

## How to report
- Name the specific corner case that has no test, cite the file:line of the
  function under test, and state the concrete input that would exercise it.
- Do not report a corner case that is provably unreachable given the calling
  code's own validation (say why, briefly, if you considered and dismissed
  one).
- Prefer one finding per distinct missing case over one broad "add more
  tests" finding — each must be independently actionable.
Quick tweak.