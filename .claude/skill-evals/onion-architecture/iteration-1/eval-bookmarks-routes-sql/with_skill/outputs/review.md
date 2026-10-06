# Architecture Review: `modules/bookmarks/routes.ts`

Reviewed against the onion-architecture skill and the placement table therein.

---

## Summary

The file ships with **five distinct violations**. Every ring between `routes.ts`
and the database is collapsed: there is no `service.ts`, no `repository.ts`,
no DTO mapping, and business errors are expressed as raw HTTP codes rather than
domain errors. Nothing is correctly placed; only the Fastify plugin scaffold
and Zod body schema are in the right layer.

---

## Violation 1 — SQL queries live in `routes.ts` (routes bypass repository)

**Rings affected:** routes → ~~repository~~ (repository ring is missing entirely)

**Files / lines:**

| Location | Detail |
|---|---|
| `routes.ts:1` | `import { eq, and } from 'drizzle-orm'` — Drizzle operators belong in `repository.ts` |
| `routes.ts:4` | `import * as t from '../../db/schema.js'` — schema import belongs in `repository.ts` |
| `routes.ts:15-18` | `db.select().from(t.bookmarks).where(…)` — SELECT for list handler |
| `routes.ts:29-33` | `db.select().from(t.bookmarks).where(and(…))` — SELECT for duplicate check |
| `routes.ts:38-41` | `db.insert(t.bookmarks).values(…).returning()` — INSERT |
| `routes.ts:50-53` | `db.delete(t.bookmarks).where(and(…))` — DELETE |

**Rule:** The placement table is unambiguous — *"Any Drizzle query → `modules/<n>/repository.ts`"*. Routes must never touch `drizzle-orm` operators or `db/schema.ts` directly.

**Fix:** Create `modules/bookmarks/repository.ts` and move all four queries there as named functions. Routes call the repository functions; they never see a Drizzle query.

```ts
// modules/bookmarks/repository.ts
import { eq, and } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export async function listBookmarks(db: Db, workspaceId: string) {
  return db.select().from(t.bookmarks).where(eq(t.bookmarks.workspaceId, workspaceId));
}

export async function findBookmarkByUrl(db: Db, workspaceId: string, url: string) {
  return db.select().from(t.bookmarks)
    .where(and(eq(t.bookmarks.workspaceId, workspaceId), eq(t.bookmarks.url, url)));
}

export async function createBookmark(db: Db, values: { workspaceId: string; url: string; title: string; tags: string[]; createdBy: string }) {
  const [row] = await db.insert(t.bookmarks).values(values).returning();
  return row;
}

export async function deleteBookmark(db: Db, workspaceId: string, id: string) {
  await db.delete(t.bookmarks)
    .where(and(eq(t.bookmarks.id, id), eq(t.bookmarks.workspaceId, workspaceId)));
}
```

---

## Violation 2 — Business logic (duplicate URL invariant) lives in `routes.ts` (routes bypass service)

**Rings affected:** routes → ~~service~~ (service ring is missing entirely)

**Files / lines:**

| Location | Detail |
|---|---|
| `routes.ts:29-35` | Duplicate-URL check: `if (existing.length > 0) { … }` — a business invariant |

**Rule:** *"Orchestration, invariants, business rules → `modules/<n>/service.ts` — zero SQL"*. The question "can this URL be bookmarked in this workspace?" is a business rule, not an HTTP concern. Routes must not encode it.

**Fix:** Create `modules/bookmarks/service.ts` that owns this invariant and throws a typed domain error (see Violation 4). Routes call `bookmarkService.create(…)` and let any thrown error propagate to Fastify's error handler.

```ts
// modules/bookmarks/service.ts  (abbreviated)
import { ConflictError } from '../../platform/errors.js';
import * as repo from './repository.js';

export async function createBookmark(db: Db, workspaceId: string, userId: string, body: CreateBookmarkBody) {
  const existing = await repo.findBookmarkByUrl(db, workspaceId, body.url);
  if (existing.length > 0) throw new ConflictError('Bookmark already exists');
  const row = await repo.createBookmark(db, { ...body, workspaceId, createdBy: userId });
  return toBookmarkDto(row);   // see Violation 3
}
```

---

## Violation 3 — Raw `$inferSelect` rows returned directly to the caller (no DTO mapping)

**Rings affected:** repository → routes (missing helpers.ts mapper)

**Files / lines:**

| Location | Detail |
|---|---|
| `routes.ts:19` | `reply.send(rows)` — `rows` is `typeof t.bookmarks.$inferSelect[]`, a raw DB row type |
| `routes.ts:43` | `reply.status(201).send(row)` — same: `row` is `$inferSelect` |

**Rule:** *"Returning a `$inferSelect` row outward? → map to a DTO in helpers.ts"*. DB row types are an implementation detail of the repository ring. Leaking them through the HTTP response couples the API shape to the table schema and makes future schema changes breaking changes.

**Fix:** Add `modules/bookmarks/helpers.ts` with a `toBookmarkDto` function. Call it in the service before returning, and in the routes layer only through the service's return type.

```ts
// modules/bookmarks/helpers.ts
import type { bookmarks } from '../../db/schema.js';
import type { InferSelectModel } from 'drizzle-orm';

export type BookmarkDto = {
  id: string;
  url: string;
  title: string;
  tags: string[];
  createdAt: string;
};

export function toBookmarkDto(row: InferSelectModel<typeof bookmarks>): BookmarkDto {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    tags: row.tags,
    createdAt: row.createdAt.toISOString(),
  };
}
```

---

## Violation 4 — HTTP status code for conflict hardcoded in `routes.ts` instead of using `platform/errors.ts`

**Rings affected:** routes (misuse of platform layer)

**Files / lines:**

| Location | Detail |
|---|---|
| `routes.ts:35-36` | `reply.status(409).send({ error: { code: 'conflict', message: 'Bookmark already exists' } })` |

**Rule:** `platform/errors.ts` exports `ConflictError` (status 409) and `NotFoundError` (status 404) precisely so that domain errors are expressed once and translated uniformly by Fastify's error handler. Hard-coding `reply.status(409)` in a route handler bypasses that translation path and scatters HTTP status logic across handlers.

Note that the DELETE handler (`routes.ts:50-54`) silently succeeds even when no row is found (no `404` is returned). With a proper service layer, the service would throw `NotFoundError` after checking the delete result, and the error handler would translate it to 404 automatically.

**Fix:** Remove the inline `reply.status(409).send(…)` block. Throw `new ConflictError('Bookmark already exists')` from the service (see Violation 2). Fastify's error handler (already wired via `platform/`) will send the correct 409 shape.

---

## Violation 5 — Route params cast with `as` instead of validated with Zod

**Rings affected:** routes (HTTP validation gap)

**Files / lines:**

| Location | Detail |
|---|---|
| `routes.ts:48` | `const { id } = req.params as { id: string }` — unsafe cast, bypasses Fastify schema validation |

**Rule:** Routes own HTTP validation; the Zod schema passed to `schema:` is the correct mechanism, not a TypeScript cast. A cast does not validate at runtime.

**Fix:** Add a `ParamsSchema` and pass it in the route's `schema` option:

```ts
const BookmarkParams = z.object({ id: z.string().uuid() });

app.delete('/bookmarks/:id', {
  schema: { params: BookmarkParams },
}, async (req, reply) => {
  const { id } = req.params as z.infer<typeof BookmarkParams>; // safe after schema validation
  …
});
```

---

## Recommended final shape

After all fixes, the module should contain exactly these files — none more, none fewer:

```
modules/bookmarks/
  routes.ts       HTTP handlers, Zod schemas, status codes — no SQL, no business logic
  service.ts      Business invariants (duplicate check, existence guard) — no SQL, no HTTP
  repository.ts   All Drizzle queries, always scoped by workspace_id — no HTTP, no business logic
  helpers.ts      toBookmarkDto mapper — pure transform, no I/O
```

`routes.ts` calls `service.ts`; `service.ts` calls `repository.ts`; `repository.ts` calls `db`; `helpers.ts` is called by `service.ts`. No ring imports a ring that is farther from the center than itself.
