# e2e/ — @devdigest/e2e

Deterministic browser flows driven by agent-browser. How to run: `README.md`.

## IMPORTANT — what `specs/` means here

In THIS package `specs/` holds **agent-browser flow JSON**
(`01-app-boot.flow.json` … `07-settings.flow.json`), not prose feature specs.
Prose about e2e coverage goes in `docs/`; cross-package feature specs go in
the root `specs/`.

## Conventions

- Runs are **deterministic: no LLM**. A new flow must never require an API key
  or depend on model output.
- Flows need the real stack plus a seeded DB — drive them via `../scripts/e2e.sh`,
  not by hand-starting servers.
- Installs with `npm ci` and keeps its own `package-lock.json`.
- Flows are numbered in run order; keep the `NN-name.flow.json` naming so the
  suite stays readable and ordered.
- Assertions live in `lib/assert.ts` — extend that rather than inlining ad-hoc
  checks into a flow.
- Flows hardcode seeded fixture values from `server/src/db/seed.ts`
  (`acme/payments-api` as the first repo, PR #482, file `src/config.ts`, finding
  title "Hardcoded Stripe secret key in commit"). Changing those specifics in
  the seed will silently break flows in this package — re-run the suite after
  editing the seed.

## Read when

- Running the suite, flow file structure → `README.md`
- Where this suite sits in the overall strategy → `../TESTING.md`
- What the seeded fixtures contain → `../server/src/db/seed.ts`
- Planning new coverage → `docs/coverage-plan.md` (create it if absent)
- A symptom feels familiar → `INSIGHTS.md`
