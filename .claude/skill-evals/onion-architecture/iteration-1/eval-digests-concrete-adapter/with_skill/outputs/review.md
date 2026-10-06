# Architecture Review — `modules/digests`

Reviewed against the onion-architecture conventions in `server/src/`:
rings flow inward-only, adapters implement ports defined in
`vendor/shared/adapters.ts`, the container is the only place adapters are
wired, and secrets flow exclusively through `SecretsProvider`.

---

## Findings

### V1 — Service imports a concrete adapter by path (CRITICAL)

**File:** `modules/digests/service.ts:2`

```ts
import { OpenAICompletionClient } from '../../adapters/openai/client.js';
```

**Ring violated:** Use Cases (service) → Adapters. The rule is that the
service tier couples only to _ports_ (interfaces in `vendor/shared/adapters.ts`),
never to a concrete adapter class. A direct import from `adapters/**` in a
service is the same anti-pattern documented in `reference/anti-patterns.md`
under "Service importing concrete adapters instead of ports"
(`modules/repo-intel/service.ts:22,28`).

The consequence: any test that instantiates `DigestService` is forced to
load the real `openai` SDK. There is no test seam.

**Fix:** Declare an `LLMProvider` port (one already exists at
`vendor/shared/adapters.ts:21–23`) and resolve it through the container — see
V4 and V5 below for the companion changes required.

---

### V2 — Service reads `process.env` for a secret and constructs the adapter itself (CRITICAL)

**File:** `modules/digests/service.ts:12`

```ts
this.llm = new OpenAICompletionClient(process.env.OPENAI_API_KEY ?? '');
```

Two violations in one line:

1. **Secret bypasses `SecretsProvider`.** `process.env` must never be read in
   feature code. The single env-read point is `adapters/secrets/local.ts`.
   All feature code calls `container.secrets.get('OPENAI_API_KEY')` (async).
   A synchronous `process.env` read here means a missing key silently produces
   an empty string; `SecretsProvider.get` can throw a typed error or be mocked
   to an always-missing value in tests.

2. **Adapter is `new`-ed inside the service.** The service constructs the
   adapter rather than receiving it from the container. Even if the import were
   fixed, the `new` call means the container can never inject a mock. See the
   "Service importing concrete adapters" anti-pattern in `reference/anti-patterns.md`.

**Fix:**
- Add an `llm` getter to `Container` (see V5).
- Change `DigestService` to accept `LLMProvider` as a constructor argument
  (or resolve it from the container before constructing the service in
  `routes.ts`).
- The `OpenAICompletionClient` constructor should read its key via
  `SecretsProvider`, or `container.llm` should call `secrets.get` when it
  lazily initialises the client (mirror the `github()` getter pattern in
  `platform/container.ts:30–38`).

---

### V3 — `OpenAICompletionClient` does not implement the `LLMProvider` port (HIGH)

**File:** `adapters/openai/client.ts:10`

```ts
async complete(prompt: string, model = 'gpt-4o-mini'): Promise<string>
```

The existing `LLMProvider` port at `vendor/shared/adapters.ts:21–23` has a
different signature:

```ts
complete(input: { model: string; prompt: string }): Promise<{ text: string; costUsd: number }>
```

`OpenAICompletionClient` is not declared `implements LLMProvider`, its
parameter order differs, and it returns a bare `string` instead of
`{ text, costUsd }`. This means the adapter cannot be swapped into any code
that types its dependency as `LLMProvider`, and the port provides no safety
net.

**Fix:** Update `OpenAICompletionClient` to match the `LLMProvider` signature
and add `implements LLMProvider`. If cost tracking is not yet available from
the OpenAI response, return `costUsd: 0` as a placeholder until the
completions API response object is inspected for usage data.

---

### V4 — No `llm` entry in `Container` or `ContainerOverrides` (HIGH)

**File:** `platform/container.ts` (entire file)

`ContainerOverrides` (lines 6–11) has no `llm?: LLMProvider` field, and
`Container` (lines 13–39) has no `llm` getter. This means:

- There is no authorised injection point for the LLM provider.
- Tests have no way to override the adapter without monkey-patching
  `process.env` (which is the exact pattern V2 creates).
- `pnpm arch` cannot verify the dependency edge because it is not wired
  through the container at all.

**Fix:** Following the `secrets` / `github()` pattern already in the container:

```ts
// platform/container.ts
import type { LLMProvider } from '../vendor/shared/adapters.js';

export interface ContainerOverrides {
  // ...existing fields...
  llm?: LLMProvider;
}

export class Container {
  private llmClient?: LLMProvider;

  // lazy getter (async, mirrors github())
  async llm(): Promise<LLMProvider> {
    if (this.overrides.llm) return this.overrides.llm;
    if (!this.llmClient) {
      const apiKey = await this.secrets.get('OPENAI_API_KEY');
      if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
      this.llmClient = new OpenAICompletionClient(apiKey);
    }
    return this.llmClient;
  }
}
```

---

### V5 — `findByRepo` ignores the `repoId` argument (MEDIUM)

**File:** `modules/digests/repository.ts:10–14`

```ts
async findByRepo(workspaceId: string, repoId: string): Promise<DigestRow[]> {
  return this.db
    .select()
    .from(t.digests)
    .where(eq(t.digests.workspaceId, workspaceId))   // repoId never used
    .orderBy(t.digests.createdAt);
}
```

The method accepts `repoId` but the WHERE clause filters only by
`workspaceId`. The result set will include digests from every repo in the
workspace. This is both a functional bug and a data-isolation risk.

**Fix:**

```ts
import { and, eq } from 'drizzle-orm';

async findByRepo(workspaceId: string, repoId: string): Promise<DigestRow[]> {
  return this.db
    .select()
    .from(t.digests)
    .where(
      and(
        eq(t.digests.workspaceId, workspaceId),
        eq(t.digests.repoId, repoId),
      )
    )
    .orderBy(t.digests.createdAt);
}
```

---

### V6 — `DigestRow` (`$inferSelect`) used as the public domain type (MEDIUM)

**Files:**
- `modules/digests/repository.ts:5` — `export type DigestRow = typeof t.digests.$inferSelect`
- `modules/digests/service.ts:4,15,22` — return type of both public methods
- `modules/digests/routes.ts:15,26` — HTTP response body

The raw Drizzle inferred type is the module's only domain type. Persistence
details (exact column names, nullable inference, `Date` vs `string` coercion)
leak from the repository outward through the service and directly into the
HTTP response. This is the "DB row type as the domain model" anti-pattern
documented in `reference/anti-patterns.md`.

The HTTP layer sends the raw row to the client, meaning any schema migration
immediately changes the API contract without a mapping step to absorb it.

**Fix:** Define a `DigestDto` in a sibling `helpers.ts` and map to it in the
repository (or at the service boundary) before returning:

```ts
// modules/digests/helpers.ts
import type { DigestRow } from './repository.js';

export interface DigestDto {
  id: string;
  repoId: string;
  prNumber: string;
  summary: string;
  createdAt: string; // ISO string, not Date
}

export function toDigestDto(row: DigestRow): DigestDto {
  return {
    id: row.id,
    repoId: row.repoId,
    prNumber: row.prNumber,
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
  };
}
```

---

## Pre-flight checklist (from the skill) applied to this module

| Check | Result |
|---|---|
| New SDK import (`openai`) behind a port? | **FAIL** — V1, V3 |
| Service calling `new SomeAdapter()`? | **FAIL** — V2 |
| Secret read via `SecretsProvider`? | **FAIL** — V2 |
| Container getter + `ContainerOverrides` key for the new adapter? | **FAIL** — V4 |
| Query scoped by `workspace_id`? | Pass (present, but `repoId` missing — V5) |
| `$inferSelect` row returned outward? | **FAIL** — V6 |
| `repository.ts` exists for queries? | Pass |
| `service.ts` has zero SQL? | Pass |
| `routes.ts` has zero business logic? | Pass |

---

## Summary

| # | File | Line(s) | Severity | Ring affected |
|---|---|---|---|---|
| V1 | `service.ts` | 2 | CRITICAL | Use Cases → Adapters (wrong direction) |
| V2 | `service.ts` | 12 | CRITICAL | Use Cases reads env + constructs adapter |
| V3 | `adapters/openai/client.ts` | 10 | HIGH | Adapters — port not implemented |
| V4 | `platform/container.ts` | (absent) | HIGH | Composition root — no wiring for `LLMProvider` |
| V5 | `repository.ts` | 10–14 | MEDIUM | Persistence — missing `repoId` filter |
| V6 | `repository.ts` | 5 | MEDIUM | Persistence details leak through all three tiers |

V1 and V2 are blockers for the PR. V3 and V4 must be fixed together with V1/V2
as part of the same change — they are the other half of the same port+adapter
pattern. V5 is a functional bug. V6 is lower priority but should be addressed
before the module grows a third consumer of `DigestRow`.
