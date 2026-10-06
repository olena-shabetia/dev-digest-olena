# Architecture Review: Bookmarks Module

**File reviewed:** `modules/bookmarks/routes.ts`  
**Date:** 2026-10-06

---

## Summary

The bookmarks module collapses three distinct architectural concerns — HTTP
routing, business logic, and data access — into a single file.  In a
layered/onion architecture the rule is that each ring may only depend on rings
inward from it; the HTTP layer (routes) must not reach directly into the
database layer.  Every issue below is a consequence of that collapsed structure.

---

## Findings

### CRITICAL — Routes import the database schema directly

**File:** `modules/bookmarks/routes.ts:4`

```ts
import * as t from '../../db/schema.js';
```

The database schema (`db/schema.ts`) belongs to the infrastructure/persistence
ring.  Routes belong to the outermost delivery ring.  A route file importing DB
schema directly skips both the service and repository layers, welding HTTP
concerns to storage concerns.  Any change to the DB column names or table
structure now forces edits in the HTTP handler.

**Fix:** Introduce a `repository.ts` (or `repository/` folder) that owns all
Drizzle queries.  The routes file should never reference `db/schema.ts`.

---

### CRITICAL — Raw Drizzle queries live inside route handlers

**File:** `modules/bookmarks/routes.ts:15–18, 29–33, 38–41, 50–53`

```ts
const rows = await app.container.db
  .select()
  .from(t.bookmarks)
  .where(eq(t.bookmarks.workspaceId, ws.id));
```

Data-access code (constructing and executing queries) is the repository layer's
job.  Having it in route handlers means the HTTP handler knows about Drizzle,
table names, and column predicates.  This breaks the dependency rule: the
delivery layer now depends on the persistence layer directly.

**Fix:** Move every query into a `BookmarksRepository` class (or module-level
functions in `repository.ts`).  Route handlers should call something like
`repo.listByWorkspace(ws.id)`, not build a Drizzle query inline.

---

### HIGH — Business logic lives in a route handler

**File:** `modules/bookmarks/routes.ts:29–35`

```ts
const existing = await app.container.db
  .select()
  .from(t.bookmarks)
  .where(and(eq(t.bookmarks.workspaceId, ws.id), eq(t.bookmarks.url, body.url)));

if (existing.length > 0) {
  return reply.status(409).send({ error: { code: 'conflict', message: 'Bookmark already exists' } });
}
```

The rule "a URL may not be bookmarked twice in a workspace" is a domain
invariant, not an HTTP concern.  Embedding it in the route handler means the
business rule cannot be reused, tested independently of HTTP, or enforced by any
non-HTTP caller (e.g. a future CLI or background job).

**Fix:** Move the duplicate-URL guard into a `BookmarksService.create()` method
that throws a `ConflictError` (see below).  The route handler's responsibility
ends at translating the HTTP request into a service call and the service result
into an HTTP response.

---

### HIGH — Manual 409 response instead of `ConflictError`

**File:** `modules/bookmarks/routes.ts:35`

```ts
return reply.status(409).send({ error: { code: 'conflict', message: 'Bookmark already exists' } });
```

The project already has `platform/errors.ts` with a `ConflictError` class whose
purpose is exactly this.  Bypassing it produces an inconsistent error-response
shape (the manual payload may not match what the central Fastify error handler
produces from an `AppError`) and means this endpoint behaves differently from
every other endpoint that uses the shared error hierarchy.

**Fix:** Throw `new ConflictError('Bookmark already exists')` from the service
layer and let the platform error handler serialize it uniformly.

---

### HIGH — Missing service layer

There is no `modules/bookmarks/service.ts`.  In a layered architecture the
canonical module structure for `server/src/modules/<name>/` is:

```
routes.ts      ← HTTP delivery only
service.ts     ← orchestration + business rules
repository.ts  ← data access
```

The absence of a service layer is what forced both the business logic and the
DB queries to leak into the routes file.

**Fix:** Create `service.ts` with at minimum `list(workspaceId)`, `create(data)`,
and `remove(id, workspaceId)`.  Routes call the service; the service calls the
repository.

---

### MEDIUM — `req.params` cast is unvalidated

**File:** `modules/bookmarks/routes.ts:48`

```ts
const { id } = req.params as { id: string };
```

The POST handler validates its body with a Zod schema, but the DELETE handler
casts `req.params` unsafely.  If the route is registered with a dynamic segment
the value is always a string, but there is no schema attached to the route
definition, so Fastify performs no coercion or validation.  More importantly,
the inconsistency is a signal: params should be declared in the route schema just
as the body is.

**Fix:** Declare a params schema for the DELETE route:

```ts
const BookmarkParams = z.object({ id: z.string().uuid() });

app.delete('/bookmarks/:id', {
  schema: { params: BookmarkParams },
}, async (req, reply) => { ... });
```

---

### MEDIUM — DELETE silently succeeds for non-existent IDs

**File:** `modules/bookmarks/routes.ts:50–53`

```ts
await app.container.db
  .delete(t.bookmarks)
  .where(and(eq(t.bookmarks.id, id), eq(t.bookmarks.workspaceId, ws.id)));

return reply.status(204).send();
```

The handler always returns `204` regardless of whether any row was deleted.
Because `NotFoundError` exists in `platform/errors.ts`, the project convention
is to surface 404 when a requested resource does not exist.  Returning `204` for
a non-existent ID is misleading to callers.

**Fix:** Use Drizzle's `.returning()` (or check affected row count) to detect a
no-op delete.  If no row was deleted, throw `new NotFoundError('Bookmark')`.
Move this check into the service layer.

---

### LOW — Zod schema passed to Fastify `schema` without a type provider

**File:** `modules/bookmarks/routes.ts:22–24`

```ts
app.post('/bookmarks', {
  schema: { body: CreateBookmarkBody },
}, async (req, reply) => {
```

Fastify's native JSON Schema validator does not understand a Zod object.  Without
`@fastify/type-provider-zod` (or equivalent) configured globally, Fastify will
either ignore the schema entirely or throw at startup.  The subsequent manual
cast on line 27 (`req.body as z.infer<typeof CreateBookmarkBody>`) suggests the
author knows Fastify is not actually parsing with Zod, which makes the schema
declaration misleading — it appears to be validation but may not be.

**Fix:** Either configure the Zod type provider globally so Fastify uses the
schema for both validation and type inference (making the cast on line 27
unnecessary), or convert `CreateBookmarkBody` to a plain JSON Schema object and
use `z.infer` only for the TypeScript type.

---

### LOW — GET returns unbounded result set

**File:** `modules/bookmarks/routes.ts:15–19`

```ts
const rows = await app.container.db
  .select()
  .from(t.bookmarks)
  .where(eq(t.bookmarks.workspaceId, ws.id));
return reply.send(rows);
```

No `limit`, `offset`, or cursor is applied.  For workspaces with many bookmarks
this will return an arbitrarily large payload in a single request.

**Fix:** Add pagination (at minimum a `limit`/`offset` query-param pair validated
in the route schema).  Move the paginated query into the repository.

---

## Recommended module structure

```
src/modules/bookmarks/
  routes.ts       # HTTP only: parse → call service → respond
  service.ts      # Domain rules: duplicate guard, ownership checks
  repository.ts   # Drizzle queries only; no business logic
```

After refactoring, `routes.ts` should contain zero imports from `db/schema.ts`,
zero inline Drizzle queries, and zero business-rule conditionals.
