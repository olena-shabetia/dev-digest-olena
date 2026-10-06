Not ready for a PR yet. The module passes the tier audit (routes has no DB import, service has no SQL, repository exists), but it has one real correctness bug and two rule violations that would be flagged in review. I haven't edited anything. I reviewed the fixture copy under `scratchpad/fixtures/eval2/server/src/`, and `pnpm arch` can't run against it because it has no dependency-cruiser config.

## Blockers

**1. `repository.ts:10-16`: `findByRepo` ignores `repoId`.** The query filters on `workspaceId` only, so `GET /repos/:repoId/digests` returns every digest in the workspace across all repos. The `repoId` parameter is unused. Fix:
```ts
.where(and(eq(t.digests.workspaceId, workspaceId), eq(t.digests.repoId, repoId)))
```
Add a test that two repos in one workspace return only their own digests.

**2. `service.ts:2,8,12`: the service builds its own OpenAI adapter and reads the env var.** `new OpenAICompletionClient(process.env.OPENAI_API_KEY ?? '')` breaks three rules:
- Secrets go through `SecretsProvider`, and `platform/config.ts:12` names it the single env chokepoint.
- Services resolve adapters through the container, so `ContainerOverrides` can't swap it in tests.
- Concrete adapter imports from a service are the pattern the anti-patterns reference lists.

The tree already has a port for this, `LLMProvider` in `vendor/shared/adapters.ts:21`. The fixture's `OpenAICompletionClient` doesn't implement it (it returns a `string`, not `{ text, costUsd }`). The real tree already has `adapters/llm/openai.ts` and `container.llm('openai')` (`platform/container.ts:196`), which reads `OPENAI_API_KEY` through the secrets provider. Replace the constructor logic with:
```ts
const llm = await this.container.llm('openai');
const { text } = await llm.complete({ model: DIGEST_MODEL, prompt });
```
Then delete `adapters/openai/client.ts` from this PR, since it duplicates the existing provider.

## Should fix before the PR

**3. `service.ts:20`: prompt assembly is in the service.** The skill puts prompt assembly in `reviewer-core/src/**`, which is pure. Move the prompt builder there, or at minimum to a pure helper. The model name `'gpt-4o-mini'` (`client.ts:10`) should go in `modules/digests/constants.ts`.

**4. `service.ts:11`: the service constructs its own repository.** Other modules get repositories from the container (the anti-patterns reference cites `container.agentsRepo`). Either expose a `digestRepo` on the container or accept the repository as a constructor argument.

**5. `repository.ts:5`, `routes.ts:16,27`: the DB row type is the domain type.** `DigestRow = typeof t.digests.$inferSelect` flows through the service and out of the routes unmapped. Add `modules/digests/helpers.ts` with `toDigestDto` and return DTOs from the routes. This matches `modules/settings/helpers.ts` and `modules/repo-intel/helpers.ts`.

**6. `service.ts:19`: `generateDigest` never checks that `repoId` belongs to the workspace.** A POST with an arbitrary `repoId` writes a digest for it. Look the repo up through the repos repository first and reject a mismatch.

## Checked and fine

- `routes.ts` has no Drizzle or `db/schema` imports and no business logic.
- `new DigestService(app.container)` per request matches the other modules' routes.
- The module has all three tiers, so the tier audit passes.

If you want, I can apply fixes 1–6 in the fixture and add the repo-scoping test. I'd check `pnpm arch` on the real tree before opening the PR.