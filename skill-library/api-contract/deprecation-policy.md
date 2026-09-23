---
name: deprecation-policy
description: Checks that a field or route being retired follows the deprecation path — an explicit @deprecated marker plus a sunset signal, and the old field/route kept working alongside the new one for at least one minor version — rather than being silently deleted in the same diff that adds its replacement.
type: convention
---

# Deprecation Policy

Retiring a field or route is two steps across at least two releases. Step 1
(this diff, if it introduces the replacement): mark the old thing
deprecated but keep it working. Step 2 (a LATER diff, ≥1 minor version
later): remove it. Flag any diff trying to do both at once.

## What a correct deprecation looks like

1. **Explicit marker**: a `@deprecated` tag or inline comment naming the
   replacement.
2. **Sunset signal**: a stated sunset date/version in the comment, a
   `Deprecation`/`Sunset` response header, or a changelog entry with a
   concrete removal-target version.
3. **Old and new coexist**: the old field/route still returns/accepts real
   data — not a stub, not an error — for at least one full minor version.

## Bad

```ts
// Adds `totalAmount` and deletes `total` in the same PR, no notice
const OrderResponse = z.object({
  totalAmount: z.number(), // new
  // total: z.number(),   <- silently removed
});
```
Any caller reading `response.total` breaks the moment this ships — no
version had both names, no signal was given.

## Good

```ts
/**
 * @deprecated Use `totalAmount` instead. `total` removed in v3.0
 *   (sunset: 2026-12-01). Both populated until then.
 */
totalAmount: z.number(),
total: z.number(),
```
```
reply.header('Deprecation', 'true');
reply.header('Sunset', 'Sat, 01 Dec 2026 00:00:00 GMT');
```
Callers on the old name keep working and get a concrete date to migrate by
before actual removal, which lands in its own later diff.

## How to apply this to a diff

1. Did this diff delete a field/route/param in the same change that adds
   its replacement? If yes and no prior deprecation window exists, this is
   a silent breaking removal, not a deprecation.
2. If this diff only ADDS a `@deprecated` marker, check it names the
   replacement, gives a sunset date/version, and the old path still works.
3. Both names added but nothing marked deprecated: flag as SUGGESTION — an
   accumulation risk with no documented removal trigger.
4. Cite the exact `file:line` of the removed symbol or the missing/present
   marker.
