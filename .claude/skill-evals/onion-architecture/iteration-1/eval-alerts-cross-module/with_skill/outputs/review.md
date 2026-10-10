# Onion Architecture Review — `modules/alerts`

Reviewed files:
- `modules/alerts/repository.ts`
- `modules/alerts/service.ts`
- `modules/alerts/routes.ts`
- `modules/repos/constants.ts` (imported by service)
- `vendor/shared/adapters.ts`, `db/schema.ts`, `platform/container.ts` (base)

---

## Summary

Three violations found. The repository layer is clean. The service layer has two
violations (SQL bypass + cross-module import). All three layers share one
additional violation: raw DB rows are returned outward without DTO mapping,
which leaks a sensitive field (`signingSecret`) to callers.

---

## Violation 1 — SQL in the service layer

**Severity: HIGH**
**Ring affected: service (use-case) ring**
**Files:** `service.ts:1`, `service.ts:3`, `service.ts:23–29`

```
// service.ts
1  import { eq, and } from 'drizzle-orm';
3  import * as t from '../../db/schema.js';

23     const existing = await this.container.db
24       .select()
25       .from(t.alertChannels)
26       .where(and(
27         eq(t.alertChannels.workspaceId, workspaceId),
28         eq(t.alertChannels.webhookUrl, data.webhookUrl),
29       ));
```

The rule is absolute: `service.ts` must contain **zero SQL**. The duplicate-URL
check is a valid business invariant, but implementing it with a raw Drizzle
query inside the service is the exact pattern flagged in
`reference/anti-patterns.md` under "Service tier reaching past its repository"
(`modules/settings/feature-models.ts:41` is the canonical example).

The consequence is that SQL now lives in two places — `repository.ts` (for
`findAll`/`findById`/`insert`) and `service.ts` (for the duplicate check).
`workspace_id` scoping can no longer be verified in a single file, which is the
primary reason the repository abstraction exists.

**Fix:** Add a `findByWebhookUrl` method to `AlertChannelRepository` and remove
the Drizzle imports from `service.ts`:

```ts
// repository.ts — add this method
async findByWebhookUrl(workspaceId: string, webhookUrl: string) {
  const rows = await this.db
    .select()
    .from(t.alertChannels)
    .where(and(
      eq(t.alertChannels.workspaceId, workspaceId),
      eq(t.alertChannels.webhookUrl, webhookUrl),
    ));
  return rows[0] ?? null;
}

// service.ts — replace the inline query
async createChannel(workspaceId: string, data: { ... }) {
  const existing = await this.repo.findByWebhookUrl(workspaceId, data.webhookUrl);
  if (existing) {
    throw new Error('A channel with this webhook URL already exists');
  }
  return this.repo.insert({ ...data, workspaceId, enabled: true });
}
```

After the fix, `service.ts` no longer needs `drizzle-orm` or `db/schema`
imports and `this.container.db` is only used in the constructor to pass `db`
to the repository.

---

## Violation 2 — Cross-module import

**Severity: MEDIUM**
**Ring affected: service (use-case) ring**
**Files:** `service.ts:4`, `service.ts:38–40`

```
// service.ts
4  import { DEFAULT_BRANCH } from '../repos/constants.js';

38   async getDefaultBranch(): Promise<string> {
39     return DEFAULT_BRANCH;
40   }
```

Feature modules are siblings, not a hierarchy. `alerts/service.ts` importing
directly from `../repos/constants.js` creates an undeclared dependency between
two modules that bypasses the composition root — identical in structure to the
documented violation at `modules/repos/service.ts:14` (`anti-patterns.md`
"Cross-module import" section).

`getDefaultBranch()` is also semantically misplaced: the alerts module is
responsible for webhook notification channels, not for Git branch configuration.
Its presence here suggests either the method was added for convenience or it
belongs in a different module entirely.

**Fix — two options, pick one:**

Option A (if `getDefaultBranch` is genuinely needed in the alerts module):
Promote `DEFAULT_BRANCH` to a cross-cutting location that modules may share:
```
server/src/platform/git-defaults.ts   // or vendor/shared, if shared with client
export const DEFAULT_BRANCH = 'main';
```
Then both `repos/` and `alerts/` import from there, with no sibling dependency.

Option B (if `getDefaultBranch` is not actually needed by alerts callers):
Delete the method from `AlertService` entirely. If a route or another service
needs the default branch value, have it import from a shared platform constant
or call the `repos` service through the container.

---

## Violation 3 — Raw `$inferSelect` rows returned outward (includes sensitive field)

**Severity: HIGH**
**Ring affected: repository → service → routes chain**
**Files:** `repository.ts:8–12` (findAll), `repository.ts:15–21` (findById),
`repository.ts:23–26` (insert), `routes.ts:15`, `routes.ts:25`

```
// repository.ts — all three methods return raw Drizzle rows
async findAll(workspaceId: string) {
  return this.db.select().from(t.alertChannels)...  // returns $inferSelect[]
}
async insert(data: ...) {
  const [row] = await this.db.insert(...).returning();
  return row;  // returns $inferSelect
}

// routes.ts
15   return reply.send(await svc.listChannels(ws.id));  // raw rows to HTTP
25   return reply.status(201).send(channel);             // raw row to HTTP
```

The skill checklist item: *"Returning a `$inferSelect` row outward? → map to a
DTO in `helpers.ts`."* The `alertChannels` schema (`db/schema.ts:28–36`) includes
a `signingSecret` column. Because no DTO mapping exists, that secret is
serialised into every `GET /alert-channels` and `POST /alert-channels` response
body — an active security leak, not just an architectural tidiness concern.

The same anti-pattern is documented in `reference/anti-patterns.md` under
"DB row type as the domain model" (`modules/reviews/repository.ts:19`).

**Fix:** Add a `helpers.ts` file in `modules/alerts/` with a DTO type and a
mapping function:

```ts
// modules/alerts/helpers.ts
import type * as t from '../../db/schema.js';

export type AlertChannelDto = {
  id: string;
  workspaceId: string;
  name: string;
  webhookUrl: string;
  enabled: boolean;
  createdAt: Date;
  // signingSecret intentionally omitted
};

export function toAlertChannelDto(
  row: typeof t.alertChannels.$inferSelect,
): AlertChannelDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    webhookUrl: row.webhookUrl,
    enabled: row.enabled,
    createdAt: row.createdAt,
  };
}
```

Then update service methods to map through the DTO before returning:

```ts
// service.ts
async listChannels(workspaceId: string): Promise<AlertChannelDto[]> {
  const rows = await this.repo.findAll(workspaceId);
  return rows.map(toAlertChannelDto);
}

async createChannel(...): Promise<AlertChannelDto> {
  ...
  return toAlertChannelDto(await this.repo.insert({ ... }));
}
```

Routes then receive `AlertChannelDto` objects and the secret never reaches the
wire.

---

## What is clean

- **`repository.ts` query structure** — all three query methods correctly scope
  by `workspaceId` (lines 12, 19–20). This is the single most important
  invariant in the repository ring and it holds.
- **`routes.ts` HTTP shape** — Zod schema is declared at the module level
  (lines 5–9) and passed to the Fastify `schema` option (line 19). The route
  handlers contain no business logic beyond delegating to the service.
- **`routes.ts` service instantiation** — `new AlertService(app.container)` is
  acceptable; the container carries all infrastructure, and constructing the
  service in the route handler is the established pattern in this codebase.
- **`repository.ts` Drizzle imports** — importing `eq`/`and` from `drizzle-orm`
  and `* as t` from `db/schema` is correct and expected at the repository ring.

---

## Pre-flight checklist state

```
- [ ] Adding a query? → repository.ts exists and is used — YES
- [x] Query scoped by workspace_id? — YES (repository.ts:12, 19, 23)
- [ ] New SDK import? — no new SDK
- [x] Service calling new SomeAdapter()? — no adapters instantiated
- [ ] Importing another module's folder? — VIOLATION: service.ts:4
- [ ] Returning a $inferSelect row outward? — VIOLATION: routes.ts:15, 25
- [ ] SQL in service.ts? — VIOLATION: service.ts:23–29
```

---

## Required changes before merging

| # | File | Lines | Action |
|---|------|-------|--------|
| 1 | `modules/alerts/repository.ts` | — | Add `findByWebhookUrl(workspaceId, webhookUrl)` |
| 2 | `modules/alerts/service.ts` | 1, 3, 23–29 | Remove Drizzle imports; replace inline query with `this.repo.findByWebhookUrl(...)` |
| 3 | `modules/alerts/service.ts` | 4, 38–40 | Remove cross-module import and `getDefaultBranch()`; if constant is needed, promote to `platform/` or `vendor/shared` |
| 4 | `modules/alerts/helpers.ts` | — | Create with `AlertChannelDto` type and `toAlertChannelDto` mapper (omit `signingSecret`) |
| 5 | `modules/alerts/service.ts` | 14–16, 33–35 | Map rows through `toAlertChannelDto` before returning |
