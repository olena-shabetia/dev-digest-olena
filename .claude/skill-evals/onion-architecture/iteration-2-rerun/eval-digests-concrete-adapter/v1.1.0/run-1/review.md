## Review: `modules/digests`

I reviewed the copy in `scratchpad/fixtures/eval2/server/src`, against the onion-architecture placement table and the pre-flight checklist. This isn't a git checkout, so I didn't run `pnpm arch`. The routes and repository tiers are in good shape. The service is the problem: it bypasses the port, and the repository has a real bug.

**1. Correctness: `findByRepo` ignores `repoId`** (`repository.ts:10-16`)
The `WHERE` clause filters only on `workspaceId`, so a digest list for one repo returns digests for every repo in the workspace. `repoId` is an unused parameter. This is a bug, not just a layering issue. Fix:

```ts
.where(and(eq(t.digests.workspaceId, workspaceId), eq(t.digests.repoId, repoId)))
```

(import `and` from `drizzle-orm`). Add a test that two repos in one workspace don't leak into each other.

**2. Service imports a concrete adapter and constructs it** (`service.ts:2, 8, 12`)
`new OpenAICompletionClient(...)` in the service is the case the checklist names: "Service calling `new SomeAdapter()`? use `container.<x>` instead." The skill's anti-patterns file calls out the same shape. Consequences:
- Tests can't swap the LLM through `ContainerOverrides`, because no `llm` key exists.
- The service reads `process.env.OPENAI_API_KEY` directly. The rule is that `SecretsProvider` is the only secrets path, and `adapters/secrets/local.ts` is the single env read point.
- A missing key silently becomes `''` and fails at call time, not at startup.

The port already exists: `LLMProvider` in `vendor/shared/adapters.ts:21`. The fix follows the four-step recipe in the skill:
1. Make `OpenAICompletionClient` `implements LLMProvider`. Its current `complete(prompt, model) → string` doesn't match the port's `complete({model, prompt}) → {text, costUsd}`, so the adapter needs to map its return value.
2. Read the key via `container.secrets.get('OPENAI_API_KEY')` in a lazy `container.llm` getter.
3. Add `llm?: LLMProvider` to `ContainerOverrides`.
4. Add a mock to `adapters/mocks.ts`. That file isn't in the tree I was given, so I can't confirm whether it exists.

The service then uses `this.container.llm.complete({ model, prompt })` and reads `.text`.

**3. Prompt assembly in the service** (`service.ts:20`)
The placement table puts prompt assembly in `reviewer-core/src/**`, not the service. The instruction string and the diff framing are domain logic and should move there. This is a medium-priority item, but it's the reason the service's job is not just orchestration.

**4. The service takes the whole `Container`** (`service.ts:10`)
This couples the service to the composition root. Passing narrow dependencies (`db`, `llm`) makes it easier to test and makes the rings clearer. Smaller issue, but worth doing while you're in there.

**5. DB row type leaks outward** (`repository.ts:5`, `service.ts:19`, `routes.ts:27`)
`DigestRow = typeof t.digests.$inferSelect` is the return type the service and routes both use, so the HTTP response is the raw persistence shape. The anti-pattern file recommends a `*Dto` mapper in `helpers.ts` at the edge. This isn't caught by `pnpm arch`, so it's a review item.

**6. Smaller points**
- `routes.ts:14, 25`: `new DigestService(app.container)` per request. Acceptable, but if other modules resolve services through the container, follow that.
- `prNumber: z.string()` in the body but `text` in the DB. Confirm the GitHub client's type (`number` in `GitHubClient`) and be consistent.

**Clean:**
- `routes.ts` has no Drizzle or `db/schema` imports and no business logic beyond the service call.
- All SQL is in `repository.ts`, and the insert path is scoped by `workspaceId`.
- No `reviewer-core` or `platform` imports from the module.

**Before the PR:** fix #1 and #2, which are the ones that block merge. #3 and #4 can be follow-ups if you want to keep the PR small, but say so in the description. Then run `pnpm arch` on the real repo, since I couldn't run it here.

I haven't edited anything. Tell me if you want me to apply #1 and #2.