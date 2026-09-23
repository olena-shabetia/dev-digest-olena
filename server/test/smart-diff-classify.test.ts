import { describe, it, expect } from 'vitest';
import { classifyFile } from '../src/modules/smart-diff/helpers.js';

/**
 * Hermetic coverage for `classifyFile` — transcribes EVERY row of the
 * path→role table frozen in `plans/L03-smart-diff.md` §3 /
 * `server/specs/L03-smart-diff.api.md` verbatim. This test is written
 * BEFORE `helpers.ts` exists (it must fail first), then the implementation
 * is written against it. A row is never edited to match the code — the
 * table is the contract.
 *
 * ★ = documented edge case; ◆ = one of the four categories the user's
 * GitHub test PR must contain.
 */
const TABLE: { path: string; role: string; why: string }[] = [
  // ---- boilerplate (rule 1) ----
  { path: 'server/pnpm-lock.yaml', role: 'boilerplate', why: '◆ rule 1, exact basename' },
  { path: 'client/pnpm-lock.yaml', role: 'boilerplate', why: 'rule 1' },
  { path: 'reviewer-core/package-lock.json', role: 'boilerplate', why: 'rule 1' },
  { path: 'web/yarn.lock', role: 'boilerplate', why: 'rule 1' },
  { path: 'poetry.lock', role: 'boilerplate', why: 'rule 1, .lock suffix' },
  { path: 'server/dist/server.js', role: 'boilerplate', why: 'rule 1, /dist/' },
  { path: 'client/build/index.html', role: 'boilerplate', why: 'rule 1, /build/' },
  {
    path: 'client/src/x/__snapshots__/x.snap',
    role: 'boilerplate',
    why: "★ rule 1's .snap + /__snapshots__/ fire before rule 2's /__tests__/-style test rules",
  },
  { path: 'src/api.generated.ts', role: 'boilerplate', why: 'rule 1, .generated.' },
  { path: 'public/vendor/jquery.min.js', role: 'boilerplate', why: 'rule 1, .min.js' },

  // ---- tests (rule 2) ----
  { path: 'server/test/smart-diff-classify.test.ts', role: 'tests', why: '◆ rule 2' },
  { path: 'server/test/reviews.it.test.ts', role: 'tests', why: 'rule 2, .it.test.ts' },
  { path: 'client/src/components/x/X.test.tsx', role: 'tests', why: 'rule 2' },
  { path: 'src/lib/format.spec.ts', role: 'tests', why: 'rule 2' },
  { path: 'server/test/helpers/db.ts', role: 'tests', why: 'rule 2 /test/ beats rule 3' },
  { path: 'server/test/helpers/index.ts', role: 'tests', why: "rule 2 precedes rule 3's barrel rule" },
  { path: 'packages/x/tests/thing.ts', role: 'tests', why: 'rule 2, /tests/' },
  { path: 'e2e/specs/05-pr-diff.flow.json', role: 'tests', why: 'rule 2, /e2e/ prefix' },
  {
    path: 'e2e/README.md',
    role: 'tests',
    why: "★ rule 2's /e2e/ prefix precedes rule 4's .md — the whole e2e package is test material",
  },
  { path: 'e2e/playwright.config.ts', role: 'tests', why: "rule 2 precedes rule 3's .config." },

  // ---- wiring (rule 3) ----
  { path: 'server/src/modules/index.ts', role: 'wiring', why: '◆ rule 3, barrel' },
  { path: 'client/src/components/diff-viewer/index.ts', role: 'wiring', why: 'rule 3, barrel' },
  { path: 'client/next.config.ts', role: 'wiring', why: 'rule 3, .config.' },
  { path: 'server/tsconfig.json', role: 'wiring', why: 'rule 3' },
  { path: 'client/tsconfig.build.json', role: 'wiring', why: 'rule 3' },
  { path: '.eslintrc.cjs', role: 'wiring', why: 'rule 3' },
  { path: 'server/.env.example', role: 'wiring', why: 'rule 3' },
  { path: 'docker-compose.yml', role: 'wiring', why: '◆ rule 3' },
  { path: '.github/workflows/repo-gates.yml', role: 'wiring', why: 'rule 3' },
  {
    path: '.claude/skills/security/SKILL.md',
    role: 'wiring',
    why: "★ rule 3's /.claude/ precedes rule 4's .md",
  },

  // ---- docs (rule 4) ----
  { path: 'README.md', role: 'docs', why: 'rule 4' },
  { path: 'CHANGELOG.md', role: 'docs', why: 'rule 4' },
  { path: 'LICENSE', role: 'docs', why: 'rule 4' },
  { path: 'docs/agent-prompts/README.md', role: 'docs', why: 'rule 4' },
  { path: 'specs/L03-smart-diff.md', role: 'docs', why: 'rule 4, .md' },

  // ---- core (rule 5) ----
  { path: 'server/src/modules/smart-diff/service.ts', role: 'core', why: '◆ rule 5' },
  { path: 'client/src/app/repos/[repoId]/pulls/[number]/page.tsx', role: 'core', why: 'rule 5' },
  { path: 'server/src/db/schema/reviews.ts', role: 'core', why: 'rule 5' },
  { path: 'src/middleware/ratelimit.ts', role: 'core', why: 'rule 5' },
];

describe('classifyFile', () => {
  it.each(TABLE)('$path -> $role ($why)', ({ path, role }) => {
    expect(classifyFile(path)).toBe(role);
  });
});
