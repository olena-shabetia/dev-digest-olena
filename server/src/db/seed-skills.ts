/**
 * Built-in skill bodies used by the seed.
 *
 * These mirror the same convention as `seed-prompts.ts`: the DB row is the
 * source of truth at run time — editing a body here only affects freshly
 * seeded workspaces, not an already-seeded one. A skill body is concatenated
 * as-is (or wrapped with `wrapUntrusted`, depending on `skills.source`) into
 * the assembled prompt's `## Skills / rules` section — it carries no code, no
 * tools, no execution of any kind.
 *
 * Slugs (`skills.name`) these bodies are seeded under:
 *   - `uncovered-branches` (type: rubric)
 *   - `corner-cases`       (type: rubric)
 *   - `mock-overuse`       (type: convention)
 *   - `api-contract-gate`  (type: convention) — seeded by `seed.ts` and
 *     linked to the API Contract Reviewer agent, so the skill-on/skill-off
 *     control experiment for a breaking API change is reproducible straight
 *     from `pnpm db:seed`. The constant is also reused by
 *     `server/test/fixtures/skills/` to keep the manual-import-flow fixture
 *     in sync with the same source of truth.
 */

export const UNCOVERED_BRANCHES_SKILL = `# Uncovered branches

Flag every conditional branch, error path, and early return touched by this
diff that has no corresponding test exercising it.

## What to check
- Every \`if\`/\`else\`, \`switch\` case, and ternary added or modified in the
  diff — does at least one test in the diff (or already in the suite) drive
  execution down each branch?
- Early returns (\`return\`, \`throw\`, guard clauses) — is there a test that
  hits the guard condition itself, not just the "normal" path past it?
- \`catch\` blocks and \`.catch()\` handlers — is the error path actually
  triggered in a test, or only the happy path?
- A function with N independent branches needs at least N test cases (or a
  parameterized test covering N inputs) to claim branch coverage; a single
  test that only walks the default path is not enough.

## How to report
- Cite the exact file:line of the uncovered branch, name the condition that
  selects it, and state which observable behavior a missing test would fail
  to catch (e.g., "if this guard were deleted, no test would fail").
- Do not flag branches that existed before this diff and were not touched by
  it — only new or modified branches are in scope.
- Do not flag a branch as uncovered if an existing test elsewhere in the
  suite already exercises it; only claim this when you cannot find such a
  test in the diff or the visible test files.
- Severity: a CRITICAL or error-handling branch with zero coverage is at
  least WARNING; a branch guarding data loss, security, or a payment/side
  effect with zero coverage is CRITICAL.`;

export const CORNER_CASES_SKILL = `# Corner cases

Flag missing tests for inputs at the edges of a function's domain, not just
the common case the PR's own example covers.

## What to check
- **Empty input**: empty string, empty array/object, empty collection,
  zero-length buffer — is there a test for the empty case, and does the code
  even define correct behavior for it?
- **Boundary values**: 0, -1, 1, the exact upper/lower limit of a range (e.g.
  a pagination \`limit\`, an array's last valid index, a configured max), and
  one-past-the-boundary (limit + 1, index out of range).
- **Overflow / extreme values**: very large numbers, very long strings,
  \`Number.MAX_SAFE_INTEGER\`, huge arrays — anything that could overflow a
  counter, truncate silently, or blow up memory/time complexity.
- **Null / undefined**: optional fields, nullable DB columns, missing query
  params — is the "absent" case distinguished from the "present but falsy"
  case (\`0\`, \`''\`, \`false\`)?
- **Locale-sensitive behavior**: date/time formatting, string comparison or
  sorting, number formatting (decimal separators, thousands separators),
  casing (\`toUpperCase\`/\`toLowerCase\` on non-ASCII) — is there a test that
  isn't implicitly assuming the reviewer's own locale/timezone?

## How to report
- Name the specific corner case that has no test, cite the file:line of the
  function under test, and state the concrete input that would exercise it.
- Do not report a corner case that is provably unreachable given the calling
  code's own validation (say why, briefly, if you considered and dismissed
  one).
- Prefer one finding per distinct missing case over one broad "add more
  tests" finding — each must be independently actionable.`;

export const MOCK_OVERUSE_SKILL = `# Mock overuse

Flag tests that assert on how a mock was called instead of on real behavior,
and tests that mock away so much of the system under test that they cannot
fail when the real logic breaks.

## What to check
- **Assertions on the mock itself**: \`expect(mockFn).toHaveBeenCalledWith(...)\`,
  \`toHaveBeenCalledTimes(...)\`, or inspecting \`mock.calls[...]\` as the primary
  assertion, with no accompanying assertion on the function's actual return
  value, thrown error, or an observable side effect (a DB row, an HTTP
  response body, emitted event). Call-shape assertions are acceptable as a
  secondary check, never as the only one.
- **Mocking the thing under test**: a test for module A that mocks a
  function *inside* module A (not a collaborator/dependency) — this proves
  the mock works, not that A works.
- **Over-mocked dependency graphs**: every collaborator of the unit under
  test is mocked, including pure/cheap ones that could run for real, to the
  point where the test would still pass if the real implementation were
  swapped for a no-op. Ask: "if I deleted the real function's body, would
  this test still go green?" — if yes, it is not testing behavior.
- **Mock return values that don't reflect reality**: a mocked DB call
  returning a shape the real query could never return, silently masking a
  contract mismatch the real integration would catch.

## How to report
- Cite the test file:line, name what is mocked, and state the concrete
  scenario under which the real code could regress without this test
  noticing.
- Suggest the minimal fix: assert on the return value/output instead of (or
  in addition to) the mock call, or replace the mock with the real
  implementation where it's cheap and deterministic (pure functions, an
  in-memory fake, a test DB).
- Do not flag mocking of genuinely external systems (network calls, LLM
  providers, third-party APIs, the filesystem/clock) — that is appropriate
  mocking, not overuse.`;

export const API_CONTRACT_GATE_SKILL = `# API contract gate

Flag a route handler or exported function whose signature or contract
changed in a way that would break an existing caller not touched by this
diff.

## What to check
- **HTTP route shape**: method, path, path/query param names or types,
  request body schema, or response status/shape changed on an existing route
  — check whether every caller of that route (client code, another service,
  a test) in the visible codebase was updated in the same diff.
- **Exported function signatures**: a parameter added without a default,
  removed, reordered, or retyped; a return type narrowed, widened, or
  changed shape (e.g. an object gaining/losing a required key, an array
  becoming paginated) — for any function exported from a module other tests
  or modules import.
- **Nullability changes**: a field that was always present becoming
  optional/nullable (breaks callers that don't null-check), or a
  previously-nullable field now assumed non-null (breaks callers that do).
- **Status code / error shape changes**: a route that used to return 200 now
  returning 204/404 for the same input, or an error envelope changing shape.
- **Silent behavioral contract changes**: pagination defaults, sort order,
  or filtering semantics changing without a version bump or a corresponding
  update to every call site.

## How to report
- Cite the exact file:line of the changed signature/route, name the old vs.
  new shape, and point to the specific caller (file:line) in the diff or the
  visible codebase that was NOT updated and would break.
- If every caller was updated in the same diff, this is not a finding —
  the gate exists for callers left behind, not for signature changes in
  general.
- Severity: CRITICAL when a caller left un-updated in the visible code would
  throw, silently receive wrong data, or crash at runtime; WARNING when the
  break is plausible but no concrete un-updated caller is visible in this
  diff (e.g. an external consumer you can't see).`;
