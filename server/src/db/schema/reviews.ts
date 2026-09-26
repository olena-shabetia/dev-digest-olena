import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  doublePrecision,
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import type { IntentSource } from '@devdigest/shared';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';

// ============================================================ Review & findings

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    prId: uuid('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id'),
    /** The agent_run that produced this review (links the timeline run ↔ review). */
    runId: uuid('run_id'),
    kind: text('kind', { enum: ['summary', 'review'] }).notNull(),
    verdict: text('verdict'),
    summary: text('summary'),
    score: integer('score'),
    model: text('model'),
    createdAt: now(),
  },
  (t) => ({
    // pulls/repository.ts's reviewAggregatesByPr: WHERE workspace_id + pr_id
    // IN (...) ORDER BY created_at DESC, to find each PR's LATEST review (the
    // PR-list score ring). A btree index scans backward for DESC just fine
    // without needing an explicit descending column.
    wsPrCreatedIdx: index('reviews_ws_pr_created_idx').on(t.workspaceId, t.prId, t.createdAt),
    // Agent Stats tab (L02, GET /agents/:id/stats) joins findings through
    // reviews filtered on workspace_id + agent_id — agent_id had no index.
    wsAgentIdx: index('reviews_ws_agent_idx').on(t.workspaceId, t.agentId),
  }),
);

export const findings = pgTable(
  'findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    file: text('file').notNull(),
    startLine: integer('start_line').notNull(),
    endLine: integer('end_line').notNull(),
    severity: text('severity').notNull(),
    category: text('category').notNull(),
    title: text('title').notNull(),
    rationale: text('rationale').notNull(),
    suggestion: text('suggestion'),
    confidence: doublePrecision('confidence').notNull(),
    kind: text('kind').notNull().default('finding'),
    trifectaComponents: jsonb('trifecta_components').$type<string[]>(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    // L03: true = classified in-scope, false = out-of-scope, null = not
    // classified (no intent was derived for this review's run).
    inScope: boolean('in_scope'),
  },
  (t) => ({
    // Every findings-by-review lookup (reviews/helpers.ts's reviewToDto,
    // pulls/repository.ts's findingsRollupByPr) filters/joins on review_id —
    // an FK column with no index before this.
    reviewIdx: index('findings_review_idx').on(t.reviewId),
  }),
);

// L03: provenance block mirrors convention_scans (db/schema/knowledge.ts) —
// the established shape for "a non-review LLM feature's run record".
export const prIntent = pgTable(
  'pr_intent',
  {
    prId: uuid('pr_id')
      .primaryKey()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    // Added after the table predated server/AGENTS.md's workspace_id rule;
    // it scoped only transitively through pr_id before. Backfilled in the
    // migration's hand-written UPDATE before the NOT NULL is applied.
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    intent: text('intent').notNull(),
    inScope: jsonb('in_scope')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    outOfScope: jsonb('out_of_scope')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    sources: jsonb('sources').$type<IntentSource[]>().notNull().default(sql`'[]'::jsonb`),
    confidence: text('confidence').notNull().default('low'),
    contextGaps: jsonb('context_gaps').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    headSha: text('head_sha'),
    provider: text('provider'),
    model: text('model'),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    costUsd: doublePrecision('cost_usd'),
    error: text('error'),
    generatedAt: timestamp('generated_at', { withTimezone: true }),
  },
  (t) => ({
    // Postgres does not auto-index FK columns, and every intent query filters
    // by workspace_id.
    wsIdx: index('pr_intent_ws_idx').on(t.workspaceId),
  }),
);

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
});
