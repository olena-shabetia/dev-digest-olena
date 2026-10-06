**Short answer:** No, it isn't placed correctly. `routes.ts` does all three jobs: HTTP, business logic, and SQL. It needs `repository.ts` and `service.ts` before you ship. I reviewed the only file I could find, `.claude/skills/onion-architecture/evals/files/tc1/server/src/modules/bookmarks/routes.ts`. The scratchpad path you're working in has no code, so if your real module lives elsewhere, point me at it and I'll re-check.

## Must fix before shipping

**1. Drizzle queries in `routes.ts` (lines 13–16, 28–33, 40–44, 55–58, 67–71).** Every handler touches `app.container.db`, and `routes.ts` is supposed to have zero SQL. The module has no repository, so nothing enforces `workspace_id` scoping in one place. Move the queries to `repository.ts`, with every function taking `workspaceId` as a required argument.

**2. Duplicate check is business logic in the route, and it's racy.** The select-then-insert at lines 28–41 can let two concurrent requests both pass the check. Fix it in two parts:
- Add a unique index on `(workspace_id, url)` in the schema, plus a migration. I found no `bookmarks` table anywhere in `server/src`, so the table itself is probably still missing.
- Let the insert hit the constraint, catch the unique violation in the repository, and rethrow it from the service as a conflict. Keep the pre-check only if you want a friendlier error path.

**3. The 409 is hand-built in the route.** `platform/errors.ts` has `NotFoundError`, `ValidationError`, `ExternalServiceError`, and `ConfigError`, but no conflict error. Add a `ConflictError` (409, code `conflict`) there. The global handler in `app.ts` will then produce the `{error: {code, message, details}}` envelope, so the route doesn't need to build it.

**4. Zod validation may not run.** Line 22 passes the raw Zod object as `schema: { body: CreateBookmarkBody }`. Fastify expects JSON Schema, so unless the validator compiler is wired for Zod, the body is never validated. The `req.body as z.infer<…>` cast at line 31 would hide that. The rest of the repo uses `withTypeProvider<ZodTypeProvider>()` from `fastify-type-provider-zod`, as in `modules/workspace/routes.ts`. Follow that pattern so the body is typed and validated.

**5. Auth call doesn't match the repo convention.** The code calls `app.container.auth.currentWorkspace()` and `currentUser()` with no `req`. The shared `getContext(container, req)` in `modules/_shared/context.ts` is the established way to resolve `workspaceId` and `userId` together, and it passes the request through. Use it, so tenancy is resolved the same way in every module.

## Should fix

- **`:id` is never validated.** A non-UUID id probably turns into a Postgres cast error and a 500. Validate params with Zod.
- **Delete always returns 204**, even when nothing matched. That's a defensible idempotent choice, but if you want 404 for a missing bookmark, check the affected row count in the repository and throw `NotFoundError`.
- **Dedupe on the raw URL.** `https://x.com/a` and `https://x.com/a/` will both be stored. Decide on normalization (trailing slash, case of host, tracking params) before the unique index goes in, or you'll be migrating dirty data later.
- **Return a DTO, not the raw row.** `.returning()` gives back the `$inferSelect` shape. Map it in `helpers.ts`, as the `reviews` module does for its rows.
- **Unused `req` parameters** on the GET and DELETE handlers.

## Target layout

```
modules/bookmarks/
  routes.ts      Zod params/body, call service, reply with status. No db import.
  service.ts     create (dedupe → ConflictError), list, remove. No SQL.
  repository.ts  list(wsId), findByUrl(wsId, url), insert(row), deleteById(wsId, id).
                 Every query filters on workspace_id.
  helpers.ts     row → DTO mapping
```

## Before you open the PR

- Register the module in `src/modules/index.ts`. `AGENTS.md` requires one import and one entry there.
- Add the migration for the table and the unique index.
- Add a hermetic service test with a mock repository, and a `*.it.test.ts` for the duplicate-under-concurrency case against Postgres. Keep the `.it.test.ts` naming so CI picks it up.
- Run `pnpm arch` and fix anything it reports.

I haven't changed any files. Do you want me to write the split (routes, service, repository, and the `ConflictError`) in your real module? If so, tell me where it lives.