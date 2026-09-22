---
name: response-schema
description: Flags response shape changes that break a typed caller — a field's type narrowing/widening, a field's required/optional flag flipping the wrong way, an enum value removed, nullability flipping, or a silent behavioral contract change (ordering, filtering, defaults) with no type signature change at all.
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
- **A documented behavioral guarantee changes with NO type/field change at
  all** — the schema diff is empty, but the data itself is different: a
  sort/rank constant reordered so a list's documented ordering flips, a
  default value changed, or a filter's inclusion criteria narrowed/widened.
  These never show up as a schema diff — you have to read what the code
  comment or doc string actually promises, then check whether the new logic
  still delivers it. A caller relying on "the first item is the most severe/
  most recent/highest-priority one" breaks exactly as hard as a renamed
  field, with nothing in the type system to catch it.

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

## Bad — behavioral change, zero type diff

```ts
// A comment two lines up says: "Ordered CRITICAL -> WARNING -> SUGGESTION,
// so it never reshuffles between identical requests."
// Before
const RANK: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };
// After — two values swapped; every type/schema in the diff is unchanged
const RANK: Record<string, number> = { CRITICAL: 1, WARNING: 0, SUGGESTION: 2 };
```
Nothing here fails a type check or a schema diff — `RANK`'s type is still
`Record<string, number>`. But the array this feeds now lists a WARNING
before a CRITICAL, breaking the exact ordering guarantee the adjacent
comment documents. Treat a stated ordering/behavioral guarantee the same as
a type guarantee: check whether the new logic still satisfies the comment
right above it, not just whether the types still compile.

## Good

```ts
const RANK: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };
// unchanged — or, if genuinely changing on purpose, the doc comment above
// it is updated in the same diff and the change is called out explicitly,
// not left for the reader to notice the numbers moved.
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
5. Independent of any type/schema diff: read every doc comment adjacent to
   changed code that states an ordering, filtering, or default-value
   guarantee, and check whether the new logic still delivers exactly what
   it promises. A rank/weight/priority constant, a `.sort()` comparator, a
   default parameter value, or a filter predicate can all break this with
   zero type signature change.
6. Cite the exact schema (or logic) `file:line` and the before/after
   type or behavior.
