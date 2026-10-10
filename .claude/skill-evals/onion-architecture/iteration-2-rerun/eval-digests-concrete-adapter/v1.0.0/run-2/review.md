I reviewed the digests module, but it isn't in `server/src`. The only copy I found is the eval fixture at `.claude/skills/onion-architecture/evals/files/tc2/server/src/modules/digests/`, so I reviewed that. If your PR is on another branch or uncommitted, point me at it and I'll re-run the review.

## Verdict: not ready for a PR

The module has a real correctness bug and several layer violations. The bug is the first item below.

### Correctness

**1. `repository.ts:14`: `findByRepo` ignores `repoId`.** The query filters only on `workspaceId`, so `GET /repos/:repoId/digests` returns digests for every repo in the workspace. The fix is `and(eq(workspaceId), eq(repoId))`. The `repoId` parameter is currently unused.

### Layer violations

**2. `service.ts:2,8,12`: the service imports and constructs a concrete adapter.** `OpenAICompletionClient` is not a port. The skill's rule is that services resolve adapters through `container.<x>`, and the port already exists: `LLMProvider` in `vendor/shared/adapters.ts:82`, resolved via `container.llm('openai')` (`platform/container.ts:196`). As written, the service can't be swapped in tests through `ContainerOverrides`.

**3. `service.ts:12`: the service reads `process.env.OPENAI_API_KEY`.** Secrets have a single read point, `SecretsProvider` (`adapters/secrets/local.ts`). Reading env in a service also defeats the `?? ''` fallback: a missing key becomes an empty string and fails at call time instead of at startup.

**4. `service.ts:11` and `routes.ts:14,25`: the service is constructed per request.** Each handler does `new DigestService(app.container)`, which builds a new repository and client every time. Services should be created once in the composition root and exposed on the container, as `reviews` does.

**5. `service.ts:20`: prompt text lives in the service.** Prompt assembly belongs in `reviewer-core/src/**` (see the placement table), or at minimum in a sibling `constants.ts`. This matters more once the summary prompt needs grounding or tuning.

**6. `service.ts:20-22`: the service builds SQL-side input shapes directly.** This is minor, but `insert` accepts a `DigestRow`-shaped object, so the service is coupled to the table's column names.

### Domain and boundary types

**7. `repository.ts:5`: `DigestRow = typeof t.digests.$inferSelect` leaks outward.** The service returns it, and `routes.ts:16,27` send it as-is. The skill's anti-pattern list flags this (`modules/reviews/repository.ts:19`). Add a `DigestDto` in `helpers.ts` and map at the route edge.

**8. `routes.ts:24`: `req.body as z.infer<...>` and `req.params as {...}` cast around the schema.** Fastify's typed route generics, or a Zod parse of params, avoid the cast. This is a small point, but the route should not need casts to reach the service.

### Things I could not verify

- **The fixture doesn't match the real schema.** `server/src/db/schema/ops.ts:41` defines `digests` with `periodStart`, `periodEnd`, `bodyMd`, and `deliveredTo`. It has no `repoId`, `prNumber`, `summary`, or `createdAt`, so `repository.ts` wouldn't type-check against it. If this is meant to be a real module, the schema and repository need reconciling before anything else.
- **`container.auth.currentWorkspace()`** is used in every route. I didn't confirm that method exists on the auth port.
- **`pnpm arch` was not run.** The fixture isn't in the server tree, so there was nothing to cruise.
- **`LLMProvider.complete`'s request shape** wasn't read. The fix in item 2 assumes it accepts a prompt-plus-model request; check `CompletionRequest` before porting.

### Suggested shape

- `repository.ts`: scope `findByRepo` by both `workspaceId` and `repoId`; return mapped rows.
- `service.ts`: take the `LLMProvider` and repository from the container; no `process.env`, no `new`.
- `routes.ts`: resolve the service from `app.container`; map results through a `DigestDto` in `helpers.ts`.
- Prompt text in `constants.ts` or `reviewer-core`.
- Add a mock to `adapters/mocks.ts` for the LLM so the service has a test seam.

I haven't made any changes, and nothing is committed.