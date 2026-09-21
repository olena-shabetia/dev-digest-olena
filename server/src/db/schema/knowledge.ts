import { pgTable, uuid, text, integer, jsonb, timestamp, doublePrecision, boolean, vector, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

/**
 * One extraction run over a repo (`POST /repos/:id/conventions/extract`).
 * Restart-durable — the UI's "model proposed N, verification kept M" and
 * "Scanning repository…" states are read straight from this row, not held
 * in memory. `error` is set only on `status: 'failed'` (LLM call threw;
 * nothing persisted to `conventions` for that run).
 */
export const conventionScans = pgTable(
  'convention_scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['queued', 'running', 'done', 'failed'] })
      .notNull()
      .default('queued'),
    sha: text('sha'),
    provider: text('provider'),
    model: text('model'),
    candidatesProposed: integer('candidates_proposed').notNull().default(0),
    candidatesVerified: integer('candidates_verified').notNull().default(0),
    degraded: boolean('degraded').notNull().default(false),
    degradedReason: text('degraded_reason'),
    error: text('error'),
    createdAt: now(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({
    repoCreatedIdx: index('convention_scans_repo_created_idx').on(t.repoId, t.createdAt),
  }),
);

/**
 * A house-rule candidate proposed by the extractor and code-verified against
 * the clone (path normalises, is in the sampled set, file re-reads, line is
 * in range and non-blank — see `modules/conventions/helpers.ts#verifyEvidence`).
 * `evidence*` (flat) mirrors `evidences[0]` (the highest-ranked occurrence) so
 * simple reads/indexes stay cheap; `evidences` (jsonb) carries every verified
 * occurrence, primary first, capped at 5. A re-scan REPLACES every `pending`
 * row for the repo but preserves `accepted`/`rejected` ones (criterion 48).
 */
export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scanId: uuid('scan_id').references(() => conventionScans.id, { onDelete: 'set null' }),
    category: text('category', {
      enum: [
        'naming',
        'structure',
        'error-handling',
        'testing',
        'imports',
        'typing',
        'async',
        'styling',
        'other',
      ],
    })
      .notNull()
      .default('other'),
    rule: text('rule').notNull(),
    evidencePath: text('evidence_path'),
    evidenceLine: integer('evidence_line'),
    evidenceSnippet: text('evidence_snippet'),
    evidenceSha: text('evidence_sha'),
    /** Every verified occurrence of this rule, primary first (≤5). */
    evidences: jsonb('evidences'),
    confidence: doublePrecision('confidence'),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
      .notNull()
      .default('pending'),
    edited: boolean('edited').notNull().default(false),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    repoStatusIdx: index('conventions_repo_status_idx').on(t.repoId, t.status),
    scanIdx: index('conventions_scan_idx').on(t.scanId),
  }),
);
