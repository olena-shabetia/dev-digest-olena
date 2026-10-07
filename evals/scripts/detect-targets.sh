#!/usr/bin/env bash
# CI helper for .github/workflows/evals.yml: diff the PR against its base SHA and decide which
# eval targets to run — changed skill names, changed agent names, and whether any AGENTS.md
# changed (workflow-level tier). Writes GITHUB_OUTPUT-compatible lines to stdout when
# GITHUB_OUTPUT is set, otherwise just prints them (for local debugging).
#
# Usage: evals/scripts/detect-targets.sh <base-sha>
#
# Mirrors evals/src/artifacts/paths.ts (SKILLS_DIR = .claude/skills, AGENTS_DIR = .claude/agents)
# and evals/src/scaffold.ts's hasEval() check (evals/<tier>/<name>/<name>.eval.ts) — kept in bash
# here since this runs before any Node setup step in the workflow.

set -euo pipefail

BASE_SHA="${1:?usage: detect-targets.sh <base-sha>}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

CHANGED="$(git diff --name-only "${BASE_SHA}"...HEAD)"

# Changed skill directory names: .claude/skills/<name>/... -> <name>
# (`|| true` after each grep: no match exits 1, which pipefail would otherwise treat as fatal.)
SKILLS_JSON="$(
  { echo "$CHANGED" | grep -E '^\.claude/skills/[^/]+/' || true; } \
    | sed -E 's#^\.claude/skills/([^/]+)/.*#\1#' \
    | sort -u \
    | node -e 'process.stdout.write(JSON.stringify(require("fs").readFileSync(0,"utf8").split("\n").filter(Boolean)))'
)"

# Changed agent file names: .claude/agents/<name>.md -> <name> (README.md excluded)
AGENTS_JSON="$(
  { echo "$CHANGED" | grep -E '^\.claude/agents/[^/]+\.md$' || true; } \
    | sed -E 's#^\.claude/agents/(.+)\.md$#\1#' \
    | { grep -v '^README$' || true; } \
    | sort -u \
    | node -e 'process.stdout.write(JSON.stringify(require("fs").readFileSync(0,"utf8").split("\n").filter(Boolean)))'
)"

# Any AGENTS.md anywhere (root or package-local) -> workflow-level tier.
if echo "$CHANGED" | grep -qE '(^|/)AGENTS\.md$'; then
  WORKFLOW_CHANGED=true
else
  WORKFLOW_CHANGED=false
fi

echo "skills=${SKILLS_JSON}"
echo "agents=${AGENTS_JSON}"
echo "workflow_changed=${WORKFLOW_CHANGED}"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "skills=${SKILLS_JSON}"
    echo "agents=${AGENTS_JSON}"
    echo "workflow_changed=${WORKFLOW_CHANGED}"
  } >> "$GITHUB_OUTPUT"
fi
