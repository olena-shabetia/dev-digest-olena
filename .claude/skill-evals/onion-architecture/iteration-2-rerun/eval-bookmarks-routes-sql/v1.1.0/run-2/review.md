## Verdict: not ready to ship. Move the DB work out of `routes.ts`.

The module has only `routes.ts`. It fails the layer rules in the onion-architecture skill in three ways:

- **Routes query the DB.** `routes.ts:4` imports `db/schema.js`, and every handler runs Drizzle directly (`:15`, `:29`, `:38`, `:50`). Route handlers may not query.
- **No repository tier.** All four queries are inline, so the module needs `repository.ts`.
- **No service tier.** The duplicate-URL check (`:34`) and `createdBy` assignment (`:40`) are business rules, so the module needs `service.ts`.

Module tier audit for `bookmarks`: `routes=R service=- repo=- routes_db_imports=1`.

I only had this one module to read. The fixture has no `reviews` exemplar, no migrations, and no global error handler, so I couldn't check those.

## Must fix before shipping

1. **Split into layers.** Target layout:
   - `routes.ts`: parse input, call the service, map the result to a status code.
   - `service.ts`: duplicate check, `createdBy`, and the workspace-scoped delete. It contains no SQL.
   - `repository.ts`: `listByWorkspace`, `findByUrl`, `insert`, `deleteById`. Every query takes `workspaceId`.
2. **Make the duplicate check race-safe.** The check at `routes.ts:29-36` is check-then-insert, so two concurrent POSTs with the same URL can both pass. Add a unique index on `(workspace_id, url)` in `db/schema.ts` with a migration, then catch the unique-violation error in the repository and map it to 409. Keep the pre-check only if you want a friendlier fast path.
3. **Restrict URL schemes.** `z.string().url()` at `routes.ts:7` accepts `javascript:` and other non-web schemes. If the UI renders these as links, that's a stored XSS vector. Add a refinement that only allows `http:` and `https:`.
4. **Validate the `:id` param.** `routes.ts:48` passes any string to a `uuid` column. A malformed id will probably surface as a 500 from Postgres rather than a 400. Validate it with Zod in the route's `params` schema.

## Should fix

5. **Use the platform error type.** `routes.ts:35` hand-builds the 409 body. Throw `ConflictError` from `platform/errors.ts` instead, so the body shape matches the rest of the API. This assumes the global handler maps `AppError`, which I couldn't verify.
6. **Bound the inputs.** Add `max` limits on `url`, `title`, and the `tags` array length and item length. Without them, anyone can store arbitrarily large rows.
7. **Paginate the list.** `GET /bookmarks` at `routes.ts:13-19` returns every row in the workspace.
8. **Decide the delete contract.** `routes.ts:50-54` returns 204 whether or not the row existed. That's idempotent and fine, but if you want 404 for a missing id, use `.returning()` and check the result.
9. **Drop the `as` cast.** `routes.ts:27` casts `req.body` even though the schema already validated it. Use the typed body from the schema-aware handler instead.

## Minor

- The `req` parameter is unused in most handlers.
- `.values({ ...body, ... })` at `routes.ts:40` is safe only because Zod strips unknown keys. Passing the parsed fields explicitly makes that less fragile.

## Next step

I haven't edited anything. Do you want me to do the layer split (items 1–4) in this fixture? I'd also add the unique index to `db/schema.ts`. I didn't run `pnpm arch` because this copy isn't a git repo and has no dependencies installed. It needs to run in the real repo.