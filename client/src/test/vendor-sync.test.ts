/* Guards the vendor-sync rule from client/AGENTS.md: "src/vendor/shared is a
   DERIVED copy of the contracts. Change server/src/vendor/shared/ first, then
   sync here." Runs the same check the root repo-gates.yml workflow runs
   (scripts/check-vendor-sync.sh), so drift fails a suite a developer already
   runs locally (`pnpm test`) — not only a CI-only gate.

   Deliberately shells out rather than re-implementing the diff: one source of
   truth for "what counts as drift" (see client/INSIGHTS.md, 2026-09-17). */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

describe("client/src/vendor/shared sync", () => {
  it("matches the canonical server/src/vendor/shared", () => {
    const script = path.resolve(__dirname, "../../../scripts/check-vendor-sync.sh");
    expect(() => execFileSync(script, { stdio: "pipe" })).not.toThrow();
  });
});
