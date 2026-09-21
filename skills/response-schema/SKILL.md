---
name: response-schema
description: Flags response shape changes that break a typed caller — a field's type narrowing/widening, a field's required/optional flag flipping the wrong way, an enum value removed, or nullability flipping.
type: convention
---

# Response Schema Change Detection

Compare the response schema before and after the diff, field by field. A
shape change is safe only if every value the OLD schema could ever produce
is still assignable to the NEW schema.

## What counts as breaking

- **Type narrows**: `id: string | number` → `id: string`. A caller that
  received a number now gets something it never asked for.
- **Type widens on a field callers switch on**: `status: 'open' | 'closed'`
  → `status: string`. Callers lose exhaustiveness and mishandle new values.
- **Field becomes required** that wasn't always populated for every
  existing row — old rows now serialize `undefined` where the schema
  promises a value.
- **Field becomes optional** that used to be guaranteed — a caller doing
  `.toFixed(2)` without a null check now crashes.
- **Enum value removed**: any stored/producible value still using it now
  fails `safeParse`.
- **Nullability flips either direction**: breaks a `!= null` check or a
  method call that assumed non-null.

## Bad

```ts
// Before
severity: z.enum(['CRITICAL','WARNING','SUGGESTION']),
assignee: z.string().nullable()
// After — enum value dropped AND nullability flipped
severity: z.enum(['CRITICAL','WARNING']),
assignee: z.string()
```
A stored `SUGGESTION` row now fails validation; a caller relying on
`assignee === null` meaning "unassigned" crashes once it's forced non-null
with no backfill.

## Good

```ts
severity: z.enum(['CRITICAL','WARNING','SUGGESTION','INFO']), // additive
assignee: z.string().nullable(), // unchanged
```

## How to apply this to a diff

1. Locate the response schema for every type the diff touches; diff it
   field by field against its previous version.
2. Per field: could the OLD code ever produce a value the NEW type
   rejects? If yes, name the field and both types as a finding.
3. For enums, diff the literal list — removing one is breaking unless a
   repo-wide search confirms it's never stored or produced.
4. For optional/required and nullable flips, state the direction and why
   it's unsafe without a backfill migration.
5. Cite the exact schema `file:line` and the before/after type.
