#!/usr/bin/env bash
#
# PreToolUse hook for the pr-self-review skill. Fires on every Bash call;
# only acts on `git push` / `gh pr create`, everything else passes through
# silently. Reads .devdigest/review/last-report.json — it never runs the
# review itself, a hook is a shell command, not an LLM call (see the plan's
# Architecture section).
#
# Exit-code contract (Claude Code PreToolUse):
#   allow -> exit 0, no stdout (silence IS the allow; never emit
#            permissionDecision:"allow" — that would short-circuit the rest
#            of the permission system, including the user's own allowlist)
#   deny  -> exit 0, stdout JSON {"hookSpecificOutput":{"hookEventName":
#            "PreToolUse","permissionDecision":"deny","permissionDecisionReason":"…"}}
#
# Fails CLOSED on its own crash (see `trap` below) — a `jq` parse error must
# block the push, not wave it through, or the gate is worthless.
#
# Bypass paths, stated honestly (this is agent discipline, not a security
# control): a push from the user's own terminal/IDE never touches this
# hook; string matching loses to `g=push; git $g` or a wrapper script; a
# non-Bash path to the remote (MCP git server, `gh api`) is unaffected;
# removing this hook from settings.json takes effect next session. Real
# enforcement for the team stays .github/workflows/repo-gates.yml.

set -uo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

deny() {
  trap - ERR
  local reason="$1"
  if command -v jq >/dev/null 2>&1; then
    jq -nc --arg reason "$reason" \
      '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
  else
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' \
      "${reason//\"/\\\"}"
  fi
  exit 0
}

# Fail closed: if anything below crashes (missing jq, unreadable repo, a
# typo), deny rather than silently allowing the push through.
trap 'deny "pr-self-review: the review-gate hook itself failed unexpectedly — denying to fail closed. Fix scripts/pr-self-review-lib.sh or .claude/hooks/review-gate.sh, or bypass once with an inline PR_SELF_REVIEW_SKIP=1 git push."' ERR

if ! command -v jq >/dev/null 2>&1; then
  deny "pr-self-review: jq is required by the review-gate hook and was not found on PATH."
fi

INPUT="$(cat)"
CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null)"

# Anchor at a command-separator position so `echo "run git push"` does not
# false-positive; a heredoc body containing the literal text still can —
# accepted, a spurious deny is cheap and visible (plan: Part 3, hook section).
push_re='(^|[;&|(])[[:space:]]*([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*git([[:space:]]+(-C[[:space:]]+[^[:space:]]+|--[^[:space:]]+|-[^[:space:]]+))*[[:space:]]+push([[:space:]]|$)'
pr_re='(^|[;&|(])[[:space:]]*([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*gh([[:space:]]+--[^[:space:]]+)*[[:space:]]+pr[[:space:]]+create([[:space:]]|$)'

if [[ ! "$CMD" =~ $push_re ]] && [[ ! "$CMD" =~ $pr_re ]]; then
  trap - ERR
  exit 0
fi

# Escape hatch: only honored INLINE in the command string, never from the
# ambient environment — inline keeps the bypass visible in the transcript.
skip_re='(^|[[:space:]])PR_SELF_REVIEW_SKIP=1([[:space:]]|$)'
if [[ "$CMD" =~ $skip_re ]]; then
  trap - ERR
  exit 0
fi

REPORT="$ROOT/.devdigest/review/last-report.json"
if [[ ! -f "$REPORT" ]]; then
  deny "pr-self-review: no report at .devdigest/review/last-report.json. Run the pr-self-review skill (/pr-self-review), then retry."
fi

if ! jq -e . "$REPORT" >/dev/null 2>&1; then
  deny "pr-self-review: .devdigest/review/last-report.json is not valid JSON. Re-run /pr-self-review."
fi

SCHEMA_VERSION="$(jq -r '.schemaVersion // "null"' "$REPORT")"
if [[ "$SCHEMA_VERSION" != "1" ]]; then
  deny "pr-self-review: report has schemaVersion $SCHEMA_VERSION, expected 1. Re-run /pr-self-review."
fi

# shellcheck source=../../scripts/pr-self-review-lib.sh
source "$ROOT/scripts/pr-self-review-lib.sh"
cd "$ROOT"

CURRENT_FP="$(pr_self_review_fingerprint)"
REPORT_FP="$(jq -r '.scope.fingerprint // "null"' "$REPORT")"
if [[ "$CURRENT_FP" != "$REPORT_FP" ]]; then
  deny "pr-self-review: working tree changed since the last review (fingerprint mismatch). Re-run /pr-self-review."
fi

VERDICT="$(jq -r '.verdict // "null"' "$REPORT")"
if [[ "$VERDICT" != "pass" ]]; then
  CRIT_COUNT="$(jq -r '.counts.critical // 0' "$REPORT")"
  LOCATIONS="$(jq -r '
    [.findings[]? | select(.blocking == true) | "\(.file):\(.line) \(.title)"]
    | join("; ")
  ' "$REPORT")"
  deny "pr-self-review: $CRIT_COUNT CRITICAL finding(s) unresolved — ${LOCATIONS:-see .devdigest/review/last-report.json}. Fix, then re-run /pr-self-review."
fi

trap - ERR
exit 0
