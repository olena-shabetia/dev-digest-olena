/**
 * CI change detector for the harness evals.
 *
 * Reads a newline-separated list of changed files (repo-relative) from $CHANGED_FILES and maps
 * them onto the eval suites that should run for this PR:
 *
 *   .claude/skills/<name>/**   OR  evals/skills/<name>/**   → run evals/skills/<name>  (content tier)
 *   .claude/agents/<name>.md   OR  evals/agents/<name>/**   → run evals/agents/<name>  (tool tier)
 *   any AGENTS.md (root or package-local; CLAUDE.md is a symlink to it — AGENTS.md:
 *   "Edit tools refuse to write through a symlink") / any agent / engine change → run the
 *   workflow tier
 *
 * A changed artifact with NO written evals is NOT a failure: it is reported on the `skipped_*`
 * outputs so the job can print a visible "SKIP <name> (no evals)" line instead of going red.
 *
 * Also flags when a measurement itself changed rather than the thing it measures: editing a
 * *.cases.ts file, or the grader (evals/src/scoring/**), invalidates any previously-captured
 * baseline for that target (AGENTS.md: "An eval case or the grader changed -> re-run eval:repeat
 * to recapture a baseline"). A grader change can't be scoped to one case file, so it marks every
 * skill/agent already touched in this diff for recalibration, not the whole suite.
 *
 * Emits GitHub Actions step outputs (skills, agents, run_workflow, skipped_skills, skipped_agents,
 * recalibrate_skills, recalibrate_agents) to $GITHUB_OUTPUT. Pure filesystem + string work — no deps.
 */

import { existsSync, readdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EVALS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(EVALS_DIR, "..");

const changed = (process.env.CHANGED_FILES ?? "")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

/** Does evals/<tier>/<name>/ contain at least one *.eval.ts? */
function hasEvals(tier, name) {
  const dir = join(EVALS_DIR, tier, name);
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((f) => f.endsWith(".eval.ts"));
}

/** Collect distinct artifact names touched under a `.claude` and/or `evals` prefix. */
function touched(reClaude, reEvals) {
  const names = new Set();
  for (const f of changed) {
    const m = f.match(reClaude) ?? f.match(reEvals);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

const skillNames = touched(
  /^\.claude\/skills\/([^/]+)\//,
  /^evals\/skills\/([^/]+)\//,
);
const agentNames = touched(
  /^\.claude\/agents\/([^/]+)\.md$/,
  /^evals\/agents\/([^/]+)\//,
);

const skills = skillNames.filter((n) => hasEvals("skills", n));
const skippedSkills = skillNames.filter((n) => !hasEvals("skills", n));
const agents = agentNames.filter((n) => hasEvals("agents", n));
const skippedAgents = agentNames.filter((n) => !hasEvals("agents", n));

// The workflow tier measures the LIVE harness, so anything that changes it re-triggers it:
// any AGENTS.md (root or package-local — CLAUDE.md is a symlink to it, AGENTS.md itself is the
// file that actually changes on disk), any agent definition, the workflow cases, or the engine.
const runWorkflow = changed.some(
  (f) =>
    /(^|\/)AGENTS\.md$/.test(f) ||
    f === "CLAUDE.md" ||
    f === ".claude/CLAUDE.md" ||
    /^\.claude\/agents\/.+\.md$/.test(f) ||
    /^evals\/workflow\//.test(f) ||
    /^evals\/src\//.test(f),
);

// --- recalibration: a *.cases.ts edit or a grader edit invalidates the old baseline ------------
const graderChanged = changed.some((f) => /^evals\/src\/scoring\//.test(f));
const recalibrateSkills = new Set();
const recalibrateAgents = new Set();
for (const f of changed) {
  const m = f.match(/^evals\/(skills|agents)\/([^/]+)\/.*\.cases\.ts$/);
  if (!m) continue;
  (m[1] === "skills" ? recalibrateSkills : recalibrateAgents).add(m[2]);
}
if (graderChanged) {
  for (const n of skills) recalibrateSkills.add(n);
  for (const n of agents) recalibrateAgents.add(n);
}

const out = process.env.GITHUB_OUTPUT;
const write = (k, v) => (out ? appendFileSync(out, `${k}=${v}\n`) : console.log(`${k}=${v}`));

write("skills", JSON.stringify(skills));
write("agents", JSON.stringify(agents));
write("run_workflow", String(runWorkflow));
write("skipped_skills", skippedSkills.join(" "));
write("skipped_agents", skippedAgents.join(" "));
write("recalibrate_skills", JSON.stringify([...recalibrateSkills].sort()));
write("recalibrate_agents", JSON.stringify([...recalibrateAgents].sort()));

// Human-readable summary in the step log.
console.error("── eval change detection ──");
console.error(`changed files : ${changed.length}`);
console.error(`skills → run  : ${skills.join(", ") || "(none)"}`);
console.error(`agents → run  : ${agents.join(", ") || "(none)"}`);
console.error(`workflow tier : ${runWorkflow ? "run" : "skip"}`);
if (skippedSkills.length) console.error(`SKIP skills (no evals): ${skippedSkills.join(", ")}`);
if (skippedAgents.length) console.error(`SKIP agents (no evals): ${skippedAgents.join(", ")}`);
if (recalibrateSkills.size) console.error(`recalibrate skills: ${[...recalibrateSkills].join(", ")}`);
if (recalibrateAgents.size) console.error(`recalibrate agents: ${[...recalibrateAgents].join(", ")}`);
