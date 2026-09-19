# spec: prompt assembly, untrusted-input wrapping, and the grounding gate

Behavior that must stay true. If a change to `src/prompt.ts` or
`src/grounding.ts` breaks any rule below, that's a regression, not a refactor.

## Untrusted-input wrapping

`wrapUntrusted` (`src/prompt.ts:30-34`) is the only path by which external
text (diff, PR description, repo map, specs, callers digest) enters the
prompt — required by the "all external text is data, never instructions"
invariant in `../AGENTS.md`.

- Any embedded `</untrusted>` closing tag inside the content is escaped
  (`content.replaceAll('</untrusted>', '<\\/untrusted>')`, line 32) before
  wrapping, so a diff/PR body cannot forge a delimiter to break out of the
  untrusted block.
- Output shape: `` <untrusted source="${label}">\n${safe}\n</untrusted> ``
  (line 33).
- Call sites: PR description (`prompt.ts:107`), repo-map (`:112`), diff
  (`:120`), specs (`:96`), callers digest (`:117`).
- `INJECTION_GUARD` (`prompt.ts:16-28`) is appended to the system prompt
  unconditionally at `prompt.ts:86` — never behind a flag, never conditional
  on whether a given chunk has untrusted content, per `../AGENTS.md`.

**Rule:** any new kind of input added to the assembled prompt must go through
`wrapUntrusted` with its own `source` label. Concatenating a new field
directly into the prompt string is the bug this spec exists to catch.

## Grounding gate

`groundFindings` (`src/grounding.ts:52-84`) decides which model-reported
findings survive into the persisted review.

- `buildLineIndex` (`grounding.ts:24-39`) builds, per file, a `Set<number>`
  of every line number covered by a real hunk — from `newLineNumbers` when
  present, else the range `[newStart, newStart + newLines)`.
- Every finding must first have `finding.file` present in `diff.files`
  (`grounding.ts:61-64`) — this check applies to ALL kinds, full-file or not.
- `FULL_FILE_KINDS = {'secret_leak', 'lethal_trifecta', 'phantom', 'hook'}`
  (`grounding.ts:16`) skip the line-range check entirely once the file-presence
  check passes (`grounding.ts:66-70`) — these kinds describe a property of the
  whole file, not a specific line.
- Every other kind must additionally pass `rangeIntersects` (`grounding.ts:41-46`):
  at least one line in `[finding.start_line, finding.end_line]` must be a
  member of that file's line index.
- A finding that fails either check is dropped and recorded in
  `ReviewOutcome.dropped` with a reason — never silently discarded.

**Rule:** a new finding `kind` defaults to line-range grounding. Only add it
to `FULL_FILE_KINDS` if the property it describes genuinely cannot be
attributed to a line range (like a leaked secret spanning file structure, not
a diff hunk).

## Score derivation

`scoreFromFindings` (`src/review/reduce.ts:27-30`) computes
`100 - Σ SEVERITY_PENALTY[severity]`, clamped to `[0, 100]`
(`CRITICAL=35`, `WARNING=12`, `SUGGESTION=3`, `reduce.ts:13-17`).

- Called at `run.ts:208` against `ground.kept` — the **post-grounding** set
  only.
- The model's self-reported score from `reduceReviews` (`reduce.ts:50-51`,
  itself a mean of per-chunk self-reported scores) is used solely for interim
  logging (`run.ts:193`) and is never what gets persisted or returned as the
  outcome's score.

**Rule:** if you're tempted to read `merged.score` anywhere downstream of
grounding, that's the bug — the persisted score must always be recomputed
from `ground.kept`, never propagated from the model's own claim.
