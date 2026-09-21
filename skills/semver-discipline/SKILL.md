---
name: semver-discipline
description: >-
  Maps a change class to the semver bump it requires (major/minor/patch) and
  flags a breaking diff that is mislabeled as patch or minor in its version
  bump, changelog entry, or PR description.
type: convention
---

# Semver Discipline

This skill does not decide whether a change is breaking (see
`breaking-change.md` / `response-schema.md`) — it checks that the bump
declared in the diff (package version, changelog, or PR title) MATCHES the
class of change actually made.

## Bump classes

- **MAJOR** — any breaking change: removed/renamed route, param, or
  response field; changed status code; changed/added auth requirement; a
  response type narrowing; an enum value removed; or unsafe nullability
  flip.
- **MINOR** — purely additive and backward-compatible: a new optional
  route/param, a response field appended, a new enum value, a new optional
  request body field.
- **PATCH** — no observable contract change: bug fixes matching the
  documented contract, internal refactors, perf improvements, dependency
  bumps with no API surface change.

## Bad

```
CHANGELOG.md
### 1.4.1 (patch)
- Renamed GET /orders/:id response field `total` to `totalAmount`
```
A field rename is MAJOR (see `breaking-change.md`) but ships as a patch.
Any caller reading `response.total` breaks on upgrade with no signal from
the version number.

## Good

```
CHANGELOG.md
### 2.0.0 (major)
- BREAKING: renamed `total` to `totalAmount`. `total` is removed;
  see MIGRATION.md.
```
Or redo the change as additive (keep `total`, add `totalAmount` alongside
it per `deprecation-policy.md`) and ship as MINOR instead.

## How to apply this to a diff

1. Classify the change using the breaking-change / response-schema
   catalogs.
2. Find the declared bump: `package.json` version diff, changelog entry,
   or the PR title/description's stated version impact.
3. Breaking change + patch/minor label (or no label at all) → CRITICAL;
   name the mismatch explicitly ("this is a MAJOR change labeled patch
   because X").
4. Additive change over-bumped as MAJOR is wasteful, at most SUGGESTION.
5. A breaking change with no version signal at all is still a finding —
   "no version signal for a breaking change."
