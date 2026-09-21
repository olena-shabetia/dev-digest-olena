# Report format

Three artifacts, two of them tracked by git for opposite reasons: the report
must NOT be tracked (it would poison its own fingerprint), the waivers file
MUST be tracked (a waiver has to be visible in the PR diff).

## `.devdigest/review/last-report.json` — gitignored, overwritten each run

One file, no history to garbage-collect. `.devdigest/` is gitignored
(`.gitignore`) — this is a correctness requirement, not tidiness:
`git ls-files --others --exclude-standard` (used by the fingerprint in
`scripts/pr-self-review-lib.sh`) skips ignored paths, so writing the report
does not change the very fingerprint it just recorded. If `.devdigest/` were
ever tracked, every report would be born stale.

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-09-21T14:03:11Z",
  "verdict": "fail",
  "completeness": "full",
  "counts": { "critical": 1, "warning": 2, "suggestion": 3 },
  "scope": {
    "fingerprint": "2d1660565bfd74d2635f7c44e358ee73583efe81",
    "head": "3adfc2bc56a9ec68128322bfa5bcaa6e6695c7a8",
    "baseRef": "main",
    "mergeBase": "bfd6913abcdd8d67bf865515e31d3809a839dd03",
    "packages": ["server", "client"],
    "files": [
      {
        "path": "server/src/modules/pulls/routes.ts",
        "status": "M",
        "reviewed": true,
        "skills": ["onion-architecture", "fastify-best-practices"]
      }
    ],
    "ignored": ["server/pnpm-lock.yaml"],
    "omittedForBudget": []
  },
  "gates": [
    {
      "id": "arch",
      "status": "fail",
      "exitCode": 1,
      "command": "pnpm exec depcruise src ../reviewer-core/src --config .dependency-cruiser.cjs --ignore-known",
      "durationMs": 728,
      "detail": "no-sql-outside-repository: server/src/modules/pulls/routes.ts -> drizzle-orm"
    },
    {
      "id": "typecheck:client",
      "status": "skipped",
      "exitCode": null,
      "command": "pnpm typecheck",
      "durationMs": 0,
      "skippedReason": "client/node_modules absent; pnpm install is forbidden here"
    }
  ],
  "findings": [
    {
      "id": "f-001",
      "severity": "CRITICAL",
      "blocking": true,
      "source": "gate:arch",
      "skill": "onion-architecture",
      "rule": "no-sql-outside-repository",
      "file": "server/src/modules/pulls/routes.ts",
      "line": 88,
      "title": "Inline Drizzle query in routes.ts",
      "fix": "Move to modules/pulls/repository.ts, scoped by workspace_id",
      "waived": false
    }
  ],
  "specFirst": { "flagged": false }
}
```

Field rules:

- `verdict` is `"pass"` iff no **unwaived** finding has `severity:"CRITICAL"`
  **and** no gate has `status:"fail"`.
- `completeness` is `"partial"` if any gate is `status:"skipped"` or any file
  landed in `omittedForBudget`; otherwise `"full"`.
- `schemaVersion` is load-bearing — `.claude/hooks/review-gate.sh` refuses a
  report whose version it doesn't recognize (fails closed, i.e. denies).
- Every finding **must** carry `file` and `line`. A finding that can't be
  pinned to a line is not reportable — drop it instead.
- `scope.fingerprint` is produced by `pr_self_review_fingerprint` in
  `scripts/pr-self-review-lib.sh` — the same function `review-gate.sh`
  recomputes to check freshness. Never compute it a second, different way.

## `pr-self-review.waivers.json` — tracked, at the repo root

```json
{
  "schemaVersion": 1,
  "waivers": [
    {
      "file": "server/src/modules/pulls/routes.ts",
      "rule": "no-sql-outside-repository",
      "reason": "Documented exception — server/INSIGHTS.md 2026-09-18",
      "addedBy": "olena",
      "expires": "2026-12-31"
    }
  ]
}
```

- Matching is on `(file, rule)`. A waiver never suppresses a finding
  silently: the finding still appears in `findings[]`, with
  `"waived": true, "blocking": false`, and its `reason` shown in the
  human-readable output.
- `expires` is **mandatory** (`YYYY-MM-DD`). Past its date, the waiver stops
  applying and the finding blocks again — this is what keeps the file from
  becoming a graveyard of forgotten exceptions.
- `reason` must be non-empty. A waiver with a blank reason is malformed —
  refuse to honor it and report it as such, don't silently skip it.
- This file is tracked on purpose: it sits next to the precedent it
  resembles, `server/.dependency-cruiser-known-violations.json` (the repo's
  other tracked baseline), and editing it is part of the PR diff — which
  flips the fingerprint and forces a re-review, at no extra cost.

## Human-readable output

Printed to the terminal after the JSON is written — this is the part anyone
actually reads. Group by severity in `SEVERITY_ORDER`
(`CRITICAL, WARNING, SUGGESTION`), with a clickable `file:line` per finding:

```
CRITICAL  1
  server/src/modules/pulls/routes.ts:88
  Inline Drizzle query in routes.ts
  → move to repository.ts, scope by workspace_id

WARNING   2      SUGGESTION  3      waived  1
```

Then a paste-ready block, also written to `.devdigest/review/pr-body.md`:

```markdown
## Self-review
- [x] arch · vendor-sync · typecheck · lint
- [ ] 1 CRITICAL outstanding — see above
- 1 waived (server/INSIGHTS.md 2026-09-18)
```

`pr-body.md` lives under `.devdigest/`, so it's gitignored too — it's a
scratch artifact for copy-pasting into the PR description, not a durable doc.
