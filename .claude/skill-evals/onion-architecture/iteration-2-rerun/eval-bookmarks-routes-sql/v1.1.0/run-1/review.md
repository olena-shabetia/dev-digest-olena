The bookmarks module is not placed correctly. `routes.ts` holds all the SQL and the business rules, and the module has no `service.ts` or `repository.ts`. I've reviewed only the one file in the working tree. I read `db/schema.ts`, `platform/container.ts`, `platform/errors.ts`, and the `AuthProvider` port for context. I didn't edit anything.

## Layer placement

Per the skill's module tier audit, the module fails three rules:

- **Routes importing the DB (rule 1):** `routes.ts:4` imports `db/schema.js`, and queries run at `:15-18`, `:29-32`, `:38-41`, and `:50-52`.
- **Queries without a repository (rule 2):** all four queries sit outside any `repository*` file.
- **Routes without a service (rule 3):** the duplicate-URL check (`:34-36`) is a business rule, so the module needs a service tier as well. Report both violations.

The `reviews` module is the model to follow: `routes.ts` → `service.ts` → `repository.ts`.

Suggested layout:

```
modules/bookmarks/
  routes.ts       parse body/params, call service, map to HTTP
  service.ts      duplicate check, defaults, createdBy/workspace rules
  repository.ts   list / findByUrl / insert / delete, all workspaceId-scoped
  helpers.ts      row → BookmarkDto
```

## Before you ship

1. **Race on duplicates.** The check-then-insert at `:29-41` is not atomic, so two concurrent POSTs for the same URL can both succeed. Add a unique index on `(workspace_id, url)` in `db/schema.ts` with a migration, then catch the unique violation in the repository and throw `ConflictError`. Keep the pre-check only if you want a friendlier path.

2. **Validation may not run at all.** `schema: { body: CreateBookmarkBody }` passes a raw Zod object to Fastify. Unless the app registers a Zod validator compiler (for example `fastify-type-provider-zod`), Fastify ignores it, and `req.body` is unvalidated. Then the `as z.infer<...>` cast at `:27` is hiding that. Confirm in `app.ts`. If there is no compiler, parse explicitly with `CreateBookmarkBody.parse(req.body)` in the route, or set up the compiler.

3. **Error shape.** `:35` hand-builds the 409 response. `platform/errors.ts` already has `ConflictError` and `NotFoundError`, so throw those and let the shared handler produce the response.

4. **DELETE id is not validated.** `req.params.id` goes straight to a `uuid` column, so a malformed id becomes a Postgres error and a 500. Validate it as a UUID (400 on failure). Also, `:54` returns 204 whether or not a row matched. Decide whether a missing bookmark should be 404 (`NotFoundError`) or a silent no-op, and make that explicit.

5. **URL scheme.** `z.string().url()` accepts `javascript:` and other non-web schemes. For a bookmark list that users click, restrict it to `http:`/`https:`.

6. **GET is unbounded.** `:15-19` returns every bookmark in the workspace. Add a limit and cursor, or at least a cap, before this ships.

7. **Scoping.** Every query is `workspaceId`-scoped today, which is correct. Keeping that in the repository makes it a single place to audit.

Want me to do the refactor into `service.ts` and `repository.ts`, plus the unique index and migration? I'd start there and then wire up the validation fix.