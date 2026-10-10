The alerts module has two real violations and one data-leak risk to fix. I read the three alerts files and checked them against the onion-architecture rules. I did not run `pnpm arch`.

**Violations**

1. **`service.ts:1,3,23-29`: the service runs SQL directly.** It imports `eq`/`and` from `drizzle-orm` and `* as t` from `db/schema.js`, then queries `this.container.db` for the duplicate-URL check. The module already has a repository, so this breaks rule 4 of the tier audit (service without repository). Fix: add `findByWebhookUrl(workspaceId, webhookUrl)` to `repository.ts` and call it from `createChannel`. Then drop the drizzle and schema imports from `service.ts`.

2. **`service.ts:4,38-40`: cross-module import plus an unrelated method.** `DEFAULT_BRANCH` comes from `../repos/constants.js`, which is the same cross-module reach the anti-patterns file flags. `getDefaultBranch()` has nothing to do with alert channels and nothing in the module calls it. Fix: delete the method and the import. If something needs the constant, promote it to `vendor/shared` or `platform/`.

**Risk, not a strict ring violation**

3. **`routes.ts:12-16, 25` and `repository.ts:8-13, 23-26`: raw DB rows go out over HTTP.** `findAll` and `insert` return `$inferSelect` rows, and the routes send them unchanged. The pre-flight checklist says to map to a DTO in `helpers.ts` instead. Here the rows include `signingSecret` (it is inserted from the request body), so both the GET list and the POST response may return the secret to the client. I did not open `db/schema.ts` to confirm the column name, but the insert spreads `signingSecret` into the row. Fix: add `helpers.ts` with a `toAlertChannelDto` that omits the secret, and use it in both handlers.

**Clean**

- `routes.ts` has no DB or drizzle imports and no business logic. It is the module's only HTTP-side file, and it is correct.
- `repository.ts` has no violations. Both reads filter by `workspaceId`. `insert` takes `workspaceId` from the service, which is the right shape.

**Minor, not onion-related**

- `routes.ts:14,23` constructs `new AlertService(app.container)` on every request. That works, but a container getter would match how the rest of the codebase wires services. Check `server/docs/architecture.md` before changing it.
- `service.ts` throws a plain `Error` for the duplicate URL, so the client gets a 500. A typed conflict error in `platform/errors.ts` would fix that.

Tier audit for `alerts`: routes=yes, service=yes, repository=yes, routes_db_imports=0. The only tier problem is that the service bypasses its repository.

I haven't edited anything. Do you want me to apply fixes 1 to 3? Fix 3 needs a decision from you on the DTO shape, and in particular whether the secret should be returned at all after creation.