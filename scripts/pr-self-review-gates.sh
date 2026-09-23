#!/usr/bin/env bash
#
# Tier 1 of the pr-self-review skill: the deterministic gates. Runs only the
# gates for packages the diff actually touches, mirrors repo-gates.yml's
# exact commands (never `pnpm arch` — server/package.json is skip-worktree,
# see TESTING.md — always the inlined `pnpm exec depcruise …`), and never
# runs `pnpm install` (root INSIGHTS.md 2026-09-21: local pnpm 12 fails with
# ERR_PNPM_IGNORED_BUILDS; this script must work whether or not node_modules
# exists).
#
# Prints one JSON object on stdout: the changed-file set, the freshness
# fingerprint, and each gate's status. This is a fragment, not the final
# report — .claude/skills/pr-self-review/SKILL.md merges it with the routed
# skill review, applies waivers, and writes the actual
# .devdigest/review/last-report.json.
#
# Usage:
#   ./scripts/pr-self-review-gates.sh            # run the gates, print JSON
#
# Exit code is 0 whenever the script itself ran to completion — gate
# pass/fail is reported IN the JSON (`.gates[].status`), never via this
# script's own exit code, so the caller can always read the result.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=./pr-self-review-lib.sh
source "$ROOT/scripts/pr-self-review-lib.sh"

cd "$ROOT"

mapfile -t FILES < <(pr_self_review_changed_files)
FINGERPRINT="$(pr_self_review_fingerprint)"
HEAD_SHA="$(git rev-parse HEAD)"
MERGE_BASE="$(pr_self_review_merge_base)"
BASE_REF="$(pr_self_review_base_ref)"

# --- which packages does the diff touch? -----------------------------------
touches() { pr_self_review_touches "$1" "${FILES[@]}"; }

TOUCHES_SERVER=false;        touches "server/"        && TOUCHES_SERVER=true
TOUCHES_CLIENT=false;        touches "client/"        && TOUCHES_CLIENT=true
TOUCHES_REVIEWER_CORE=false; touches "reviewer-core/"  && TOUCHES_REVIEWER_CORE=true
TOUCHES_E2E=false;           touches "e2e/"            && TOUCHES_E2E=true
TOUCHES_VENDOR_SHARED=false
for f in "${FILES[@]}"; do
  case "$f" in
    */src/vendor/shared/*) TOUCHES_VENDOR_SHARED=true ;;
  esac
done

GATE_JSON=()

# --- gate runner -------------------------------------------------------------
# $1 = gate id, $2 = package dir (relative to ROOT, "" for root),
# $3 = a "node_modules marker" dir to check before running (skip if absent),
# $4.. = the command to run, argv-style (no `sh -c` string escaping needed)
run_gate() {
  local id="$1" pkg_dir="$2" nm_check="$3"
  shift 3
  local cmd_display="$*"
  local status exit_code=0 skipped_reason="" duration_start duration_ms

  if [[ -n "$nm_check" && ! -d "$nm_check" ]]; then
    status="skipped"
    skipped_reason="${nm_check#"$ROOT/"} absent; pnpm install is forbidden here (root INSIGHTS.md 2026-09-21) — run it yourself once, then re-run this skill"
    GATE_JSON+=("$(jq -nc \
      --arg id "$id" --arg status "$status" --arg cmd "$cmd_display" \
      --arg reason "$skipped_reason" \
      '{id:$id, status:$status, exitCode:null, command:$cmd, durationMs:0, skippedReason:$reason}')")
    return 0
  fi

  duration_start=$(date +%s%3N 2>/dev/null || date +%s000)
  if [[ -n "$pkg_dir" ]]; then
    ( cd "$ROOT/$pkg_dir" && "$@" ) >/tmp/pr-self-review-gate-$$.log 2>&1
    exit_code=$?
  else
    ( "$@" ) >/tmp/pr-self-review-gate-$$.log 2>&1
    exit_code=$?
  fi
  duration_ms=$(( $(date +%s%3N 2>/dev/null || date +%s000) - duration_start ))

  if [[ $exit_code -eq 0 ]]; then status="pass"; else status="fail"; fi

  local detail
  detail="$(tail -c 4000 "/tmp/pr-self-review-gate-$$.log" 2>/dev/null || true)"
  rm -f "/tmp/pr-self-review-gate-$$.log"

  GATE_JSON+=("$(jq -nc \
    --arg id "$id" --arg status "$status" --argjson exitCode "$exit_code" \
    --arg cmd "$cmd_display" --argjson durationMs "$duration_ms" --arg detail "$detail" \
    '{id:$id, status:$status, exitCode:$exitCode, command:$cmd, durationMs:$durationMs}
     + (if $status == "fail" then {detail:$detail} else {} end)')")
}

# --- arch: one graph, cannot be package-scoped ------------------------------
# Touching either server/ or reviewer-core/ requires the FULL two-root
# depcruise run — the ~40-entry baseline in
# server/.dependency-cruiser-known-violations.json is computed over both
# roots together, so scoping this would shift indices and produce phantom
# results (see plan finding: "arch cannot be package-scoped").
if $TOUCHES_SERVER || $TOUCHES_REVIEWER_CORE; then
  run_gate "arch" "server" "$ROOT/server/node_modules" \
    pnpm exec depcruise src ../reviewer-core/src --config .dependency-cruiser.cjs --ignore-known
fi

# --- vendor-sync -------------------------------------------------------------
if $TOUCHES_VENDOR_SHARED; then
  run_gate "vendor-sync" "" "" \
    ./scripts/check-vendor-sync.sh
fi

# --- server: typecheck + lint ------------------------------------------------
if $TOUCHES_SERVER; then
  run_gate "typecheck:server" "server" "$ROOT/server/node_modules" \
    pnpm exec tsc --noEmit -p tsconfig.json
  run_gate "lint:server" "server" "$ROOT/server/node_modules" \
    pnpm lint
fi

# --- client: typecheck + lint ------------------------------------------------
if $TOUCHES_CLIENT; then
  run_gate "typecheck:client" "client" "$ROOT/client/node_modules" \
    pnpm typecheck
  run_gate "lint:client" "client" "$ROOT/client/node_modules" \
    pnpm lint
fi

# --- reviewer-core: typecheck + lint (npm package) ---------------------------
if $TOUCHES_REVIEWER_CORE; then
  run_gate "typecheck:reviewer-core" "reviewer-core" "$ROOT/reviewer-core/node_modules" \
    npm run typecheck
  run_gate "lint:reviewer-core" "reviewer-core" "$ROOT/reviewer-core/node_modules" \
    npm run lint
fi

# --- e2e: typecheck only (npm package, no lint/format configured) -----------
if $TOUCHES_E2E; then
  run_gate "typecheck:e2e" "e2e" "$ROOT/e2e/node_modules" \
    npm run typecheck
fi

# --- spec-first check (AGENTS.md: "Building a lesson feature -> write the
# spec first"). Pure path arithmetic -> lives here, not in the LLM pass.
# WARNING, never CRITICAL: refactors and bug fixes legitimately touch
# feature files with no new spec.
SPEC_FIRST_NEEDED=false
for f in "${FILES[@]}"; do
  case "$f" in
    server/src/modules/*|client/src/app/*/_components/*) SPEC_FIRST_NEEDED=true ;;
  esac
done
SPEC_PRESENT=false
if $SPEC_FIRST_NEEDED; then
  for f in "${FILES[@]}"; do
    case "$f" in
      specs/*.md|client/specs/*|server/specs/*|reviewer-core/specs/*) SPEC_PRESENT=true ;;
    esac
  done
fi
SPEC_FIRST_FLAG=false
if $SPEC_FIRST_NEEDED && ! $SPEC_PRESENT; then
  SPEC_FIRST_FLAG=true
fi

# --- assemble the fragment ---------------------------------------------------
FILES_JSON="$(pr_self_review_changed_files_with_status | jq -R -s '
  split("\n") | map(select(length > 0)) | map(split("\t"))
  | map({status: .[0], path: .[-1]})
')"

GATES_JSON="[]"
if [[ ${#GATE_JSON[@]} -gt 0 ]]; then
  GATES_JSON="$(printf '%s\n' "${GATE_JSON[@]}" | jq -s '.')"
fi

jq -n \
  --arg fingerprint "$FINGERPRINT" \
  --arg head "$HEAD_SHA" \
  --arg mergeBase "$MERGE_BASE" \
  --arg baseRef "$BASE_REF" \
  --argjson files "$FILES_JSON" \
  --argjson gates "$GATES_JSON" \
  --argjson specFirstFlag "$SPEC_FIRST_FLAG" \
  '{
     fingerprint: $fingerprint,
     head: $head,
     mergeBase: $mergeBase,
     baseRef: $baseRef,
     files: $files,
     gates: $gates,
     specFirst: { flagged: $specFirstFlag }
   }'
