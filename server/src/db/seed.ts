import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
} from './seed-prompts.js';
import {
  UNCOVERED_BRANCHES_SKILL,
  CORNER_CASES_SKILL,
  MOCK_OVERUSE_SKILL,
  API_CONTRACT_GATE_SKILL,
} from './seed-skills.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Test Quality Reviewer's system prompt (L02). Mirrors the style of the other
 * built-in prompts in `seed-prompts.ts`, but is short enough to keep inline
 * here rather than adding a fourth export there — it leans on its 3 seeded
 * skills (`uncovered-branches`, `corner-cases`, `mock-overuse`) for the bulk
 * of its instructions, appended below this prompt as `## Skills / rules`.
 */
const TEST_QUALITY_REVIEWER_PROMPT = `# Role
You are a senior engineer reviewing a pull-request diff specifically for TEST
QUALITY, not application logic. You receive the full PR diff in one pass.
Your job is to judge whether the tests included in (or missing from) this
diff would actually catch a regression — not whether the tests merely exist
and pass.

# What to look for
- Uncovered branches, error paths, and early returns introduced or modified
  by this diff with no test exercising them.
- Missing coverage for corner cases: empty input, boundary values, overflow,
  null/undefined, and locale-sensitive behavior.
- Tests that assert on mock call arguments/counts instead of on real
  behavior or output, and tests so over-mocked that they can't fail when the
  real logic breaks.
- Flaky patterns: reliance on real timers/dates/network without control,
  order-dependent tests, shared mutable state between tests, unseeded
  randomness.

The specifics of each check are governed by this agent's attached skills —
apply them as written, in the order given.

# How to analyze
- Read the diff's test files alongside the production code they cover. For
  each changed branch or edge case in the production code, look for a test
  that would fail if that logic broke.
- Only flag test gaps introduced or worsened by THIS diff. Do not demand
  retroactive coverage for pre-existing untested code the diff does not
  touch.

# Severity — use exactly these three levels
- **CRITICAL** — a CRITICAL-impact code path (data loss, security, payment,
  irreversible side effect) shipped with zero test coverage for its failure
  mode. This is the ONLY level that blocks merge.
- **WARNING** — a real coverage gap or a mock/flakiness problem that would
  let a real regression slip through, but on a lower-stakes path.
- **SUGGESTION** — a minor test-quality improvement.

# Verdict — set \`verdict\` consistently with your findings
- **request_changes** — you reported at least one CRITICAL finding.
- **comment** — you reported only WARNING / SUGGESTION findings.
- **approve** — the diff's tests would catch a regression in every path they
  touch: return an EMPTY findings list.

The verdict is a pure function of your findings. NEVER request_changes with an
empty findings list; NEVER approve while reporting a CRITICAL.

# Findings discipline
- Report only DISTINCT issues, one per gap. Every finding must cite an exact
  file:line in the diff (the untested production code, or the offending
  test). Zero findings is a valid and good answer.`;

/**
 * API Contract Reviewer's system prompt (HW2). Mirrors
 * `TEST_QUALITY_REVIEWER_PROMPT`'s style and, like it, leans on its one
 * seeded skill (`api-contract-gate`) for the bulk of its instructions. Seeded
 * (unlike the Wave-3-only client UI) so the skill-on/skill-off control
 * experiment for a breaking API change is reproducible from `pnpm db:seed`
 * alone, without a manual UI import first.
 */
const API_CONTRACT_REVIEWER_PROMPT = `# Role
You are a senior engineer reviewing a pull-request diff specifically for
BREAKING API CHANGES, not general code quality. You receive the full PR diff
in one pass. Your job is to catch a contract change — an HTTP route shape, an
exported function signature, a nullability change, a status/error shape
change — that would break an existing caller not touched by this diff.

# What to look for
The specifics of each check are governed by this agent's attached skills —
apply them as written, in the order given.

# How to analyze
- Read the diff's changed route handlers and exported functions alongside
  every caller of them visible in the diff or the surrounding codebase. A
  contract change is only a finding if at least one caller was NOT updated
  in the same diff.
- Only flag contract changes introduced by THIS diff. Do not flag a
  pre-existing inconsistency the diff does not touch.

# Severity — use exactly these three levels
- **CRITICAL** — a breaking change to a contract with at least one
  unupdated caller visible in the codebase. This is the ONLY level that
  blocks merge.
- **WARNING** — a contract change that is likely breaking but whose callers
  aren't fully visible in this diff (e.g. an external/public API).
- **SUGGESTION** — a contract change that is backward-compatible but worth
  flagging (e.g. a widened return type with no doc update).

# Verdict — set \`verdict\` consistently with your findings
- **request_changes** — you reported at least one CRITICAL finding.
- **comment** — you reported only WARNING / SUGGESTION findings.
- **approve** — no breaking contract change: return an EMPTY findings list.

The verdict is a pure function of your findings. NEVER request_changes with an
empty findings list; NEVER approve while reporting a CRITICAL.

# Findings discipline
- Report only DISTINCT issues, one per contract change. Every finding must
  cite an exact file:line in the diff (the changed signature/route, or the
  unupdated caller). Zero findings is a valid and good answer.`;

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, the five built-in agents (General + Security +
 * Performance + Test Quality + API Contract), all on the default
 * openrouter/deepseek-v4-flash provider+model, and all 4 planned skills
 * (`uncovered-branches`, `corner-cases`, `mock-overuse` linked to Test
 * Quality Reviewer in order; `api-contract-gate` linked to API Contract
 * Reviewer) — seeding `api-contract-gate` keeps the skill-on/skill-off
 * control experiment for a breaking API change reproducible from
 * `pnpm db:seed` alone; the manual-import UI flow (see specs/L02-skills.md)
 * is still exercisable by importing the same body under another name.
 *
 * Course lessons populate the other tables (conventions, memory, eval, …)
 * once their features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  // Keeps a reference to the freshly-created review (undefined on a re-seed of
  // an existing DB) so it can be linked to the Security Reviewer's agent_run
  // below — that link is what makes the Timeline's per-run severity chips
  // (see specs/L02-findings-by-severity.md) show anything on seed data.
  let review: typeof t.reviews.$inferSelect | undefined;
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset)
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
      { prId: pr!.id, path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
      { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 },
      { prId: pr!.id, path: 'src/api/users.ts', additions: 7, deletions: 2 },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
        // L03: outside the PR's stated scope (rate limiting) — demoted for
        // display, not deleted; still reported at true severity.
        inScope: false,
      },
      {
        reviewId: review!.id,
        file: 'src/middleware/ratelimit.ts',
        startLine: 28,
        endLine: 28,
        severity: 'SUGGESTION',
        category: 'style',
        title: 'Extract magic number 3600',
        rationale: 'The literal 3600 means "seconds in an hour" without explanation.',
        suggestion: 'Extract to a named constant, e.g. `WINDOW_SECONDS = 3600`.',
        confidence: 0.62,
        inScope: true,
      },
    ]);

    // ---- pr_intent (L03) ----
    // Deterministic, LLM-free intent row for PR #482 so the e2e flow (and the
    // Intent card in dev) has real data without a live LLM key. `sources`
    // includes at least one `used` and one `unavailable` entry per the plan.
    await db.insert(t.prIntent).values({
      prId: pr!.id,
      workspaceId,
      intent: 'Add token-bucket rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      inScope: [
        'Rate-limiting middleware for public endpoints',
        'Config for limiter thresholds',
      ],
      outOfScope: [
        'Refactoring the user-list endpoint query pattern',
      ],
      sources: [
        { kind: 'title', status: 'used', ref: null, chars: 42 },
        { kind: 'body', status: 'used', ref: null, chars: 96 },
        { kind: 'issue', status: 'unavailable', ref: '#412', chars: null },
        { kind: 'files', status: 'used', ref: null, chars: null },
        { kind: 'hunks', status: 'used', ref: null, chars: null },
        { kind: 'commits', status: 'used', ref: null, chars: null },
      ],
      confidence: 'medium',
      contextGaps: ['Linked issue #412 could not be fetched.'],
      headSha: pr!.headSha,
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      tokensIn: 812,
      tokensOut: 96,
      costUsd: 0.0001,
      error: null,
      generatedAt: new Date(),
    });
  }

  // ---- built-in agents (the three starter presets) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Test Quality Reviewer',
      description: 'Checks test quality: uncovered branches, missing corner cases, excessive mocking, and flaky patterns.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'API Contract Reviewer',
      description: 'Catches breaking changes to route shapes and exported function signatures.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: API_CONTRACT_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  const agentIdByName = new Map<string, string>();
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (existing) {
      agentIdByName.set(a.name, existing.id);
    } else {
      const [inserted] = await db.insert(t.agents).values(a).returning();
      agentIdByName.set(a.name, inserted!.id);
    }
  }

  // ---- built-in skills (L02 + HW2) ----
  // Bodies live in ./seed-skills.ts. `api-contract-gate` IS seeded (and
  // linked to the API Contract Reviewer below) so the skill-on/skill-off
  // control experiment for a breaking API change is reproducible straight
  // from `pnpm db:seed`. The manual-import UI flow (see specs/L02-skills.md)
  // stays exercisable separately by re-importing the same skill body under a
  // different name.
  const seedSkills: Array<typeof t.skills.$inferInsert> = [
    {
      workspaceId,
      name: 'uncovered-branches',
      description: 'Flags conditional branches, error paths, and early returns with no test coverage.',
      type: 'rubric',
      source: 'manual',
      body: UNCOVERED_BRANCHES_SKILL,
      enabled: true,
      version: 1,
    },
    {
      workspaceId,
      name: 'corner-cases',
      description: 'Flags missing tests for empty input, boundary values, overflow, null/undefined, and locale behavior.',
      type: 'rubric',
      source: 'manual',
      body: CORNER_CASES_SKILL,
      enabled: true,
      version: 1,
    },
    {
      workspaceId,
      name: 'mock-overuse',
      description: 'Flags tests that assert on mocks instead of behavior, or over-mock the system under test.',
      type: 'convention',
      source: 'manual',
      body: MOCK_OVERUSE_SKILL,
      enabled: true,
      version: 1,
    },
    {
      workspaceId,
      name: 'api-contract-gate',
      description: 'Flags a route handler or exported function whose signature or contract changed in a breaking way.',
      type: 'convention',
      source: 'manual',
      body: API_CONTRACT_GATE_SKILL,
      enabled: true,
      version: 1,
    },
  ];
  const skillIdByName = new Map<string, string>();
  for (const s of seedSkills) {
    const [existing] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, s.name)));
    if (existing) {
      skillIdByName.set(s.name, existing.id);
    } else {
      const [inserted] = await db.insert(t.skills).values(s).returning();
      skillIdByName.set(s.name, inserted!.id);
    }
  }

  // ---- link the seeded skills to the Test Quality Reviewer, in order ----
  const testQualityReviewerId = agentIdByName.get('Test Quality Reviewer');
  if (testQualityReviewerId) {
    const linkedSkillNames = ['uncovered-branches', 'corner-cases', 'mock-overuse'];
    for (let order = 0; order < linkedSkillNames.length; order++) {
      const skillId = skillIdByName.get(linkedSkillNames[order]!);
      if (!skillId) continue;
      await db
        .insert(t.agentSkills)
        .values({ agentId: testQualityReviewerId, skillId, order })
        .onConflictDoNothing();
    }
  }

  // ---- link api-contract-gate to the API Contract Reviewer ----
  const apiContractReviewerId = agentIdByName.get('API Contract Reviewer');
  const apiContractGateSkillId = skillIdByName.get('api-contract-gate');
  if (apiContractReviewerId && apiContractGateSkillId) {
    await db
      .insert(t.agentSkills)
      .values({ agentId: apiContractReviewerId, skillId: apiContractGateSkillId, order: 0 })
      .onConflictDoNothing();
  }

  // ---- demo agent runs (L01 — run cost badge) ----
  // A few completed runs against PR #482 so the COST column, the run
  // timeline, and the trace drawer's COST tile all show real numbers out of
  // the box, without requiring a live LLM key. Guarded on "no runs yet for
  // this PR" for idempotency (agent_runs has no natural unique key to upsert
  // on).
  const existingRuns = await db
    .select({ id: t.agentRuns.id })
    .from(t.agentRuns)
    .where(eq(t.agentRuns.prId, pr!.id));
  if (existingRuns.length === 0) {
    const [securityRun] = await db.insert(t.agentRuns).values([
      {
        workspaceId,
        agentId: agentIdByName.get('Security Reviewer') ?? null,
        prId: pr!.id,
        provider: DEFAULT_PROVIDER,
        model: DEFAULT_MODEL,
        status: 'done',
        durationMs: 8200,
        tokensIn: 9119,
        tokensOut: 1180,
        costUsd: 0.0013,
        // 3 findings total across the review (Stripe secret + N+1 query +
        // magic number); this run's own findings_count reflects that review.
        findingsCount: 3,
        grounding: '3/3 passed',
        score: 61,
        blockers: 1,
      },
      {
        workspaceId,
        agentId: agentIdByName.get('Performance Reviewer') ?? null,
        prId: pr!.id,
        provider: DEFAULT_PROVIDER,
        model: DEFAULT_MODEL,
        status: 'done',
        durationMs: 6400,
        tokensIn: 12011,
        tokensOut: 980,
        costUsd: 0.0014,
        findingsCount: 1,
        grounding: '2/2 passed',
        score: 78,
        blockers: 0,
      },
      {
        workspaceId,
        agentId: agentIdByName.get('General Reviewer') ?? null,
        prId: pr!.id,
        provider: DEFAULT_PROVIDER,
        model: DEFAULT_MODEL,
        status: 'done',
        durationMs: 5100,
        tokensIn: 7420,
        tokensOut: 860,
        costUsd: 0.0009,
        findingsCount: 0,
        grounding: '2/2 passed',
        score: 92,
        blockers: 0,
      },
    ]).returning();

    // Link the sample review to the run that produced it — without this,
    // ReviewRecord.run_id is null and the Timeline can't show that run's
    // severity chips (they're joined by run_id; see FindingsTab.tsx).
    if (review && securityRun) {
      await db.update(t.reviews).set({ runId: securityRun.id }).where(eq(t.reviews.id, review.id));
    }
  }

  // ---- PR #479 (UUID primary keys) — a second reviewed PR so the list page
  // (findings-by-severity, L02) has more than one row with a FINDINGS
  // popover to hover. ----
  let [pr479] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 479)));
  if (!pr479) {
    [pr479] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 479,
        title: 'Migrate sessions table to UUID primary keys',
        author: 'deepak.r',
        branch: 'chore/sessions-uuid-pk',
        base: 'main',
        headSha: 'f00dcafe1234',
        additions: 512,
        deletions: 88,
        filesCount: 6,
        status: 'needs_review',
        body: 'Swap the sessions table over to UUID primary keys ahead of the multi-region rollout.',
      })
      .returning();

    const [review479] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr479!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary: 'Migration looks sound, but the backfill lacks a rollback plan and one query still assumes integer ids.',
        score: 44,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review479!.id,
        file: 'src/db/migrations/0011_sessions_uuid.sql',
        startLine: 1,
        endLine: 40,
        severity: 'CRITICAL',
        category: 'bug',
        title: 'No rollback path if the backfill fails midway',
        rationale: 'The migration has no down-migration and no idempotency guard, so a failed backfill leaves the table half-converted.',
        suggestion: 'Wrap the backfill in a transaction, or add a resumable checkpoint column.',
        confidence: 0.91,
      },
      {
        reviewId: review479!.id,
        file: 'src/api/sessions.ts',
        startLine: 22,
        endLine: 27,
        severity: 'SUGGESTION',
        category: 'style',
        title: 'Rename `id` param to `sessionId` for clarity',
        rationale: 'The bare `id` name reads ambiguously now that both the old integer id and the new UUID coexist during migration.',
        suggestion: 'Rename to `sessionId` and update call sites.',
        confidence: 0.58,
      },
    ]);
  }

  return { workspaceId, userId };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
