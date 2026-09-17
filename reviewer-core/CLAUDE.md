# reviewer-core/ — @devdigest/reviewer-core

The pure review engine. Pipeline diagram lives in `README.md`.

## Invariants (breaking one of these breaks the package's reason to exist)

- **Zero I/O.** No DB, no GitHub, no filesystem, no persistence. The only way out
  is the injected `LLMProvider`. The same engine runs in the studio and in the
  CI runner — anything host-specific belongs to the caller.
- **Cancellation is cooperative.** It goes through the injected `checkCancelled()`
  which THROWS at the caller's chosen error type. The engine stays agnostic:
  do not import server classes and do not reach for `AbortController` here.
- **Score is derived from findings that SURVIVED grounding** — not the model's
  self-reported number, and not the pre-grounding set. This keeps the score, the
  findings list, and the emitted event in agreement by construction.
- **All external text is data, never instructions.** Any new input added to the
  prompt must go through `wrapUntrusted()`. `INJECTION_GUARD` is appended to
  every system prompt on every path — do not make it conditional.
- **Grounding is mechanical, not an LLM step.** A diff finding survives only if
  its line range intersects a real hunk in the same file. Full-file kinds
  (`secret_leak`, `lethal_trifecta`, `phantom`, `hook`) only need the file to be
  present in the diff.

## Conventions

- Installs with `npm ci` (not pnpm) and keeps its own `package-lock.json`.
- `@devdigest/shared` resolves to `../server/src/vendor/shared` — the canonical
  copy. This package never vendors its own.
- Structured output: parse strict JSON first, only fall back to fence/brace
  extraction. `extractJson` can be fooled by braces inside JSON string values.

## Read when

- Full review pipeline → `README.md`
- Reviewer prompt wording and severity conventions →
  `../docs/agent-prompts/README.md`
- Adding a prompt section or changing assembly order → `specs/<slug>.md`
  (write the spec first if it does not exist yet)
- A symptom feels familiar → `INSIGHTS.md`
