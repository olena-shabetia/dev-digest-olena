# Architecture Review: `digests` Module

**Reviewer:** General best-practice review (no framework skill loaded)
**Files reviewed:**
- `_base/server/src/vendor/shared/adapters.ts`
- `_base/server/src/db/schema.ts`
- `_base/server/src/platform/container.ts`
- `tc2/server/src/adapters/openai/client.ts`
- `tc2/server/src/modules/digests/repository.ts`
- `tc2/server/src/modules/digests/service.ts`
- `tc2/server/src/modules/digests/routes.ts`

---

## Summary

The module has **four architectural violations** and **two secondary issues** that should be resolved before merging. The most serious violation is that the service layer imports a concrete infrastructure adapter directly, inverting the dependency rule at the heart of onion/hexagonal architecture.

---

## Violations

### 1. CRITICAL — Service imports the concrete adapter, bypassing the port

**File:** `service.ts:2`, `service.ts:8`, `service.ts:12`, `service.ts:21`

```ts
import { OpenAICompletionClient } from '../../adapters/openai/client.js'; // line 2
private readonly llm: OpenAICompletionClient;                              // line 8
this.llm = new OpenAICompletionClient(process.env.OPENAI_API_KEY ?? '');  // line 12
const summary = await this.llm.complete(prompt);                          // line 21
```

The project already defines a `LLMProvider` port in `vendor/shared/adapters.ts:21–23`:

```ts
export interface LLMProvider {
  complete(input: { model: string; prompt: string }): Promise<{ text: string; costUsd: number }>;
}
```

In an onion/hexagonal architecture the rule is: **domain and application rings (service) depend only on ports (interfaces), never on adapters (concrete implementations)**. The adapter ring depends inward on those ports, not the reverse.

Here the service depends directly on `OpenAICompletionClient`, a concrete class in the adapter ring. This means:
- You cannot swap the LLM provider (e.g. for tests or a different vendor) without touching the service.
- Cost tracking (`costUsd`) defined on the port is silently lost.
- The dependency arrow points outward, violating the onion constraint.

**Fix:** Have `DigestService` accept `LLMProvider` (the port interface) via constructor injection; let the `Container` resolve the concrete adapter and supply it.

---

### 2. CRITICAL — `OpenAICompletionClient` does not implement `LLMProvider`

**File:** `adapters/openai/client.ts:10`

```ts
async complete(prompt: string, model = 'gpt-4o-mini'): Promise<string>
```

The `LLMProvider` port specifies:

```ts
complete(input: { model: string; prompt: string }): Promise<{ text: string; costUsd: number }>
```

The concrete adapter's signature differs in both argument shape (positional `string` vs. `{ model, prompt }` object) and return type (`string` vs. `{ text, costUsd }`). `OpenAICompletionClient` does **not** declare `implements LLMProvider`, so TypeScript will not catch this mismatch.

Consequences:
- The `LLMProvider` port is effectively dead — nothing satisfies it.
- Cost data (`costUsd`) is never captured or stored.
- If a future caller depends on the port contract, the adapter will fail at runtime.

**Fix:** Add `implements LLMProvider` to `OpenAICompletionClient`, align the method signature to `complete(input: { model: string; prompt: string }): Promise<{ text: string; costUsd: number }>`, and compute or estimate the cost from the API response's `usage` field.

---

### 3. HIGH — Service reads `process.env` directly, bypassing `SecretsProvider`

**File:** `service.ts:12`

```ts
this.llm = new OpenAICompletionClient(process.env.OPENAI_API_KEY ?? '');
```

The project's declared convention (CLAUDE.md) is that secrets **never** go through `process.env` in feature code — the single env-read point is `server/src/adapters/secrets/local.ts`, and all other code obtains secrets through `SecretsProvider.get(key)`. The `Container` already exposes `container.secrets`.

Beyond the convention breach, reading `process.env` here means:
- The secret cannot be rotated or mocked in tests without patching the environment.
- An empty key string is silently swallowed (`?? ''`), causing an authentication failure at runtime with no meaningful error.

**Fix:** The `Container` (or a factory function it owns) should resolve the API key via `container.secrets.get('OPENAI_API_KEY')` and construct the adapter there; the service receives the already-built `LLMProvider` port via injection.

---

### 4. HIGH — `LLMProvider` not registered in `Container`

**File:** `platform/container.ts` (entire file)

The container wires `GitHubClient`, `SecretsProvider`, `AuthProvider`, and `Db`, but has no `llm` accessor for `LLMProvider`. Because the service bypasses the container and constructs the adapter itself, the omission has no immediate runtime effect — but it is the structural gap that forced both violation 1 and violation 3.

**Fix:** Add an `async llm(): Promise<LLMProvider>` accessor on `Container` (mirroring the pattern of `github()`) that resolves the API key via `this.secrets` and lazily constructs an `OpenAICompletionClient`. Add `llm?: LLMProvider` to `ContainerOverrides` so tests can inject a mock.

---

## Secondary Issues

### 5. MEDIUM — `DigestService` constructs its own dependencies instead of receiving them

**File:** `service.ts:11–12`

```ts
this.repo = new DigestRepository(container.db);
this.llm = new OpenAICompletionClient(process.env.OPENAI_API_KEY ?? '');
```

Even setting aside the port violation, constructing collaborators inside the constructor couples the service tightly to its dependencies and makes unit testing require real database and API objects. In this project's style (illustrated by `Container`), collaborators are resolved externally and injected.

**Fix:** Accept `DigestRepository` and `LLMProvider` as constructor parameters:

```ts
constructor(
  private readonly repo: DigestRepository,
  private readonly llm: LLMProvider,
) {}
```

The routes create the service via a factory or ask the container for it.

---

### 6. MEDIUM — `DigestRepository.findByRepo` ignores the `repoId` parameter

**File:** `repository.ts:10–16`

```ts
async findByRepo(workspaceId: string, repoId: string): Promise<DigestRow[]> {
  return this.db
    .select()
    .from(t.digests)
    .where(eq(t.digests.workspaceId, workspaceId))  // repoId never used
    .orderBy(t.digests.createdAt);
}
```

The `repoId` argument is accepted but silently dropped. Every call will return all digests for the workspace, not just those for the requested repo. The `digests` table has a `repo_id` column (`schema.ts:22`).

**Fix:** Add a second condition to the `where` clause:

```ts
.where(
  and(
    eq(t.digests.workspaceId, workspaceId),
    eq(t.digests.repoId, repoId),
  )
)
```

---

### 7. LOW — Route handler casts `req.params` with `as` instead of validating it

**File:** `routes.ts:13`, `routes.ts:23`

```ts
const { repoId } = req.params as { repoId: string };
```

Fastify 5 supports JSON Schema or a Zod-based type provider for route params. A type assertion bypasses runtime validation; a malformed `repoId` will propagate into service and DB calls silently. The `body` is validated via Zod schema on the same routes, so the asymmetry is notable.

**Fix:** Add a `params` schema to both route definitions, matching the pattern used for `body`.

---

## Dependency-direction summary

```
routes.ts  →  service.ts  →  LLMProvider (port)  ←  OpenAICompletionClient
                          →  DigestRepository
                          (no direct import of adapters)
```

The current code shortcircuits this to:

```
routes.ts  →  service.ts  →  OpenAICompletionClient  (wrong — inward ring imports outward ring)
                          →  DigestRepository
```

Fixing violations 1–4 restores the correct direction.
