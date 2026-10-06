The module doesn't pass the onion-architecture checks. The working directory was empty, so I reviewed the eval fixture at `.claude/skills/onion-architecture/evals/files/tc2/server/src/modules/digests/`, the only digests module in the repo. If your PR branch lives somewhere else, point me to it and I'll re-run the review against the real files.

Findings, most severe first:

1. **The service imports an adapter that doesn't exist.** `service.ts:2` imports `adapters/openai/client.js`, and that path isn't in the tree. The real OpenAI adapter is `adapters/llm/openai.ts`, and it sits behind the `LLMProvider` port in `vendor/shared/adapters.ts:82`. The service also does `new OpenAICompletionClient(...)` (`service.ts:12`), which breaks the "resolve through `container.<x>`" rule. Tests can't swap it through `ContainerOverrides`, so they would hit the real API.

2. **The service reads the API key from `process.env` directly** (`service.ts:12`). Secrets go through `SecretsProvider` only. `container.llm('openai')` already builds the provider from the secret store.

3. **`findByRepo` ignores `repoId`** (`repository.ts:10-16`). The `where` clause filters only by `workspaceId`, so every digest in the workspace comes back for any repo. This is a correctness bug, not just layering.

4. **The row shape doesn't match the schema.** `DigestRow` and `insert` assume `repoId`, `prNumber`, `summary`, and `createdAt`. The real `digests` table (`server/src/db/schema/ops.ts:41-50`) has `periodStart`, `periodEnd`, `bodyMd`, and `deliveredTo`, with no `repoId`, `prNumber`, `summary`, or `createdAt`. Either the PR depends on a schema change that isn't in this diff, or the code was written against a different table. It won't typecheck as is. Tell me which one applies.

5. **`currentWorkspace()` is called with no argument** (`routes.ts:12`, `:22`). The port signature is `currentWorkspace(req: unknown)` (`vendor/shared/adapters.ts:300`), so this is a type error. Pass `req`.

6. **The service builds its own repository** (`service.ts:11`). Repositories should come from the container too, so tests can override them. Add a getter next to the other container members.

7. **The prompt is assembled inside the service** (`service.ts:20`). The placement table puts prompt assembly in `reviewer-core/src` or a sibling `constants.ts`/`helpers.ts`. At minimum, move the prompt template to a constant.

What's fine: routes contain no SQL or business logic beyond calling the service. The repository is the only place that touches Drizzle, and inserts are scoped by `workspaceId`.

Suggested service shape after fixes 1, 2, 6, and 7:

```ts
export class DigestService {
  constructor(private readonly container: Container) {}

  async generateDigest(workspaceId: string, repoId: string, prNumber: string, diff: string) {
    const llm = await this.container.llm('openai');
    const result = await llm.complete(buildDigestRequest(diff)); // prompt lives in constants/helpers
    return this.container.digestRepo.insert({ workspaceId, repoId, prNumber, summary: result.text });
  }
}
```

Field names in that sketch are illustrative; check `CompletionResult` in `vendor/shared/adapters.ts` and align the insert with whatever schema the PR actually uses.

I didn't run `pnpm arch` or the typechecker, since there's no git repo or `node_modules` in this environment. Run both on the real branch before opening the PR.