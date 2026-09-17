# INSIGHTS — client

Append-only log of problems already hit. Newest first. One entry per problem:
symptom → cause → fix → rule.

When an entry hardens into a standing rule, promote one line into `CLAUDE.md`
and shorten the entry here to a pointer.

---

## 2026-09-17 — `src/vendor/shared` has drifted from the server copy

**Symptom:** a contract that exists on the server is missing or narrower here.
Five files differ: `adapters.ts`, `contracts/trace.ts`, `contracts/knowledge.ts`,
`contracts/eval-ci.ts`, `contracts/productionize.ts`.

**Cause:** `@devdigest/shared` is vendored twice because Next.js cannot import
across the package root. The server copy is canonical and has moved ahead:
it adds `sessionId` on the LLM call options, `'openrouter'` in `LLMProvider.id`,
`CommitFile`/`CommitFilesPayload`, and the `AgentManifest` schema.

**Fix:** none applied — the drift sits in server-side adapter interfaces and in
contracts for lessons not yet built (e.g. `PluginAgent` from L08). Verified that
the `Provider` enum the UI actually consumes is identical in both copies and does
include `openrouter`, so nothing user-facing is affected today.

**Rule:** before editing anything under `src/vendor/shared`, diff it against
`server/src/vendor/shared`. Change the server copy first, then sync here —
otherwise the gap widens silently.
