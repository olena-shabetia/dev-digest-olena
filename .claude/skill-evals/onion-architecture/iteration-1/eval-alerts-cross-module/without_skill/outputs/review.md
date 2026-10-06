# Architecture Review: Alerts Module (Webhook Notification Channels)

## Summary

Three violations were found across the `service.ts` file. The `repository.ts` and `routes.ts` files are largely clean with one medium-severity design smell in routes.

---

## Violations

### VIOLATION 1 — Service imports a concrete infrastructure type (Dependency Inversion broken)

**File:** `service.ts:2`  
**Severity:** High

```ts
import type { Container } from '../../platform/container.js';
```

`Container` is a platform/infrastructure assembly class. In onion architecture the application layer (services) must depend on **abstractions** (interfaces or ports), never on concrete infrastructure types. By taking `Container` as its constructor argument, `AlertService` is coupled to the entire platform assembly — it can only be tested or reused in contexts where a real `Container` can be constructed.

**Fix:** Extract the two things the service actually needs from `Container` into a plain object or interface and inject only those:

```ts
// Define a minimal port for what the service needs
interface AlertServiceDeps {
  db: Db;
}

export class AlertService {
  private readonly repo: AlertChannelRepository;

  constructor(deps: AlertServiceDeps) {
    this.repo = new AlertChannelRepository(deps.db);
  }
  // ...
}
```

Alternatively, inject `AlertChannelRepository` directly so the service does not need to know about `Db` at all.

---

### VIOLATION 2 — Service bypasses its own repository and runs raw DB queries

**File:** `service.ts:1, 3, 23–29`  
**Severity:** High

```ts
import { eq, and } from 'drizzle-orm';         // line 1
import * as t from '../../db/schema.js';         // line 3
// …
const existing = await this.container.db         // line 23
  .select()
  .from(t.alertChannels)
  .where(and(
    eq(t.alertChannels.workspaceId, workspaceId),
    eq(t.alertChannels.webhookUrl, data.webhookUrl),
  ));
```

The service imports Drizzle ORM query-builder primitives and the raw DB schema and uses them to issue a SELECT directly against `this.container.db`, bypassing `AlertChannelRepository` entirely. This is a textbook layer-inversion: infrastructure concerns (SQL, ORM constructs) have leaked into the application layer.

In onion architecture all DB access must go through the repository abstraction. The service should only call named methods on `this.repo`; it must never hold a reference to `db`, `schema`, or any ORM type.

**Fix:** Add a `findByWebhookUrl` (or `existsByWebhookUrl`) method to `AlertChannelRepository` and call that from the service:

```ts
// repository.ts — add:
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

// service.ts — replace the inline query with:
const existing = await this.repo.findByWebhookUrl(workspaceId, data.webhookUrl);
if (existing) {
  throw new Error('A channel with this webhook URL already exists');
}
```

Remove the `drizzle-orm` and `../../db/schema.js` imports from `service.ts` entirely once this is done.

---

### VIOLATION 3 — Cross-module import of a sibling module's constant, and misplaced method

**File:** `service.ts:4, 38–40`  
**Severity:** Medium

```ts
import { DEFAULT_BRANCH } from '../repos/constants.js';  // line 4
// …
async getDefaultBranch(): Promise<string> {              // line 38
  return DEFAULT_BRANCH;
}
```

`AlertService` reaches into the `repos` module to import `DEFAULT_BRANCH` and then exposes it through `getDefaultBranch()`. This is wrong on two levels:

1. **Cross-module coupling.** Modules at the same layer (both are under `src/modules/`) must not import directly from each other's internals. If a shared constant is genuinely needed by multiple modules it should live in a shared location (e.g. `src/shared/constants.ts` or a dedicated domain package), not inside one module's private namespace.

2. **Wrong home for the method.** `getDefaultBranch()` is a repos-domain concern, not an alerts concern. Placing it on `AlertService` violates single-responsibility and will confuse callers who look to this service for anything related to default branches.

**Fix:** Remove `getDefaultBranch()` from `AlertService` and delete the `../repos/constants.js` import. If callers genuinely need a default-branch value, they should call into the repos module's own service/helper or read from a shared constants location — not through the alerts service.

---

### DESIGN SMELL — Service instantiated per-request

**File:** `routes.ts:14, 23`  
**Severity:** Low (not a layering violation, but a design issue)

```ts
const svc = new AlertService(app.container);  // constructed on every request
```

`AlertService` is constructed anew on each HTTP request. This defeats the purpose of dependency injection, creates unnecessary object churn, and means any per-instance state would be reset per request. Services should be constructed once (at startup or plugin registration time) and reused.

**Fix:** Construct the service once during plugin registration and close over it:

```ts
const alertRoutes: FastifyPluginAsync = async (app) => {
  const svc = new AlertService(app.container);

  app.get('/alert-channels', async (req, reply) => {
    const ws = await app.container.auth.currentWorkspace();
    return reply.send(await svc.listChannels(ws.id));
  });

  app.post('/alert-channels', { schema: { body: CreateChannelBody } }, async (req, reply) => {
    const ws = await app.container.auth.currentWorkspace();
    const body = req.body as z.infer<typeof CreateChannelBody>;
    const channel = await svc.createChannel(ws.id, body);
    return reply.status(201).send(channel);
  });
};
```

---

## What is correct

- **`repository.ts`** — clean and well-scoped. It accepts `Db` via constructor injection, uses the schema and ORM only at this layer (appropriate), exposes named query methods, and does not leak any business logic. No changes needed.
- **`routes.ts` structure** — routes correctly delegate to a service, resolve workspace identity through `app.container.auth`, and use Zod for input validation at the boundary.
- **`schema.ts`** — `alertChannels` table definition is appropriate and self-contained.

---

## Violation Summary

| # | File | Lines | Severity | Rule broken |
|---|------|--------|----------|-------------|
| 1 | `service.ts` | 2 | High | Service depends on concrete infrastructure type (`Container`) instead of an abstraction |
| 2 | `service.ts` | 1, 3, 23–29 | High | Service issues raw DB/ORM queries, bypassing the repository layer |
| 3 | `service.ts` | 4, 38–40 | Medium | Cross-module import from sibling (`repos`); method misplaced on wrong service |
| 4 | `routes.ts` | 14, 23 | Low | Service re-instantiated per request instead of once at startup |
