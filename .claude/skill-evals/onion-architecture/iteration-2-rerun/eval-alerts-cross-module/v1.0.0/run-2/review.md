Yes, there are several violations. The most serious is that the POST and GET responses return the stored `signingSecret`. The rest are placement issues in the service.

**Violations (most serious first)**

1. **Secret leaks in responses.** `routes.ts:15` and `routes.ts:25` send raw `$inferSelect` rows, so `signingSecret` goes back to the client on every list and create. This is also a row returned outward without a DTO, which the pre-flight checklist forbids. Map to a DTO in `helpers.ts` that omits the secret, or return a masked value.

2. **Secret stored as a plain column.** `db/schema.ts:33` stores `signing_secret` as `text`, and the service writes it straight through. The skill says secrets go through `SecretsProvider` only, with `adapters/secrets/local.ts` as the single env read point. Store the secret via `container.secrets` and keep only a reference in the row. Or confirm with the team that a per-channel signing secret is exempt, since the skill doesn't cover that case.

3. **SQL in the service tier.** `service.ts:1` imports `drizzle-orm`, `service.ts:3` imports `db/schema`, and `service.ts:23-29` runs a query on `this.container.db`. The skill says services have zero SQL. Move it to a method such as `findByWebhookUrl(workspaceId, url)` in `repository.ts`, and have the service call that.

4. **Cross-module import and an unrelated method.** `service.ts:4` imports `DEFAULT_BRANCH` from `../repos/constants.js`. Feature modules must stay siblings, so this is the same violation as `repos/service.ts:14` in the anti-patterns doc. `getDefaultBranch()` (`service.ts:38-40`) doesn't belong to alerts at all, so delete it.

5. **Service builds its own repository.** `service.ts:11` runs `new AlertChannelRepository(container.db)`, and `routes.ts:14` and `routes.ts:23` run `new AlertService(app.container)` on every request. The pattern the skill prescribes is `container.<x>`. Add a lazy `alerts` getter to `Container` in `platform/container.ts`, and have routes use it. This also lets tests swap the service through `ContainerOverrides`.

**Clean**

- `repository.ts` scopes `findAll` and `findById` by `workspaceId`. Nothing in it is outside the repository ring.
- `routes.ts` has no SQL and uses Zod at the boundary. `req.body as z.infer<…>` at `routes.ts:22` is a redundant cast, since Fastify already validates against the schema. Pass `req.body` directly, or type the handler's generics.

**Smaller items**

- `createChannel` checks for an existing URL and then inserts. Two concurrent requests can both pass the check. A unique index on `(workspace_id, webhook_url)` would make that airtight. This is a correctness point, not a layering one.
- I didn't run `pnpm arch`, since the fixture directory isn't a git repo with the project's tooling. Run it on the real tree before merging.