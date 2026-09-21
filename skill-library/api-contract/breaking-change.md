---
name: breaking-change
description: Flags removals or renames of a public route path, request param, or response field, and any change to a status code or auth requirement — the class of edit that breaks an existing caller without warning.
type: convention
---

# Breaking Change Detection

A change is **breaking** when an existing caller — using the API exactly as
documented before this diff — now gets an error, a different result, or is
locked out. Flag it CRITICAL regardless of how small the diff looks.

## What counts as breaking

- **Route removed/renamed**: `DELETE /users/:id` deleted, or
  `GET /pulls/:id/findings` renamed to `.../findings-list`.
- **Request param removed/renamed**: a query/path/body field callers
  currently send is no longer accepted, or accepted under a new name.
- **Response field removed/renamed**: a field a caller reads is gone or
  moved (`data.total` → `data.meta.total`).
- **Status code changed**: `200` → `201`, or a `404` case now returns `200`.
- **Auth tightened**: a public endpoint now requires a token, or a new
  required scope/permission is added.

## Bad

```ts
// Before: GET /repos/:id/findings?status=open
fastify.get('/repos/:id/findings', async (req) => {
  const { state } = req.query as { state?: string }; // renamed from "status"
  return repository.findByState(req.params.id, state);
});
```
A caller still sending `?status=open` silently gets unfiltered results — no
error, wrong data.

## Good

```ts
fastify.get('/repos/:id/findings', async (req) => {
  const q = req.query as { status?: string; state?: string };
  const state = q.state ?? q.status; // old name still honored
  return repository.findByState(req.params.id, state);
});
```
The new shape is added alongside the old one. A genuine removal follows
`deprecation-policy.md` first.

## How to apply this to a diff

1. Diff the route table (path + method) before/after — anything present
   before and missing after is breaking.
2. Diff the request fields read and response fields written by each
   changed handler — a field disappearing from either side is breaking.
3. Diff `reply.code(...)` calls and `preHandler`/auth middleware for the
   same route — any changed literal or tightened auth is breaking.
4. Cite the exact `file:line` of the removed/renamed symbol and the
   request/response field name — never report "the API changed" alone.
