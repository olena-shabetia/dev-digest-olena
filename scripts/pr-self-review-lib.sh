#!/usr/bin/env bash
#
# Shared helpers for scripts/pr-self-review-gates.sh and
# .claude/hooks/review-gate.sh. One implementation of the freshness
# fingerprint, sourced by both, so the two can never drift apart
# (see .claude/skills/pr-self-review/reference/report-format.md).
#
# Usage: source this file, then call the functions below.

set -uo pipefail

# Which ref to diff against. Prefer local "main"; fall back to "origin/main"
# for a fresh clone / detached-HEAD CI checkout that has no local main.
pr_self_review_base_ref() {
  if git rev-parse --verify --quiet main >/dev/null 2>&1; then
    echo "main"
  else
    echo "origin/main"
  fi
}

pr_self_review_merge_base() {
  git merge-base "$(pr_self_review_base_ref)" HEAD
}

# The agreed diff scope: everything between the merge-base and the current
# working tree (covers committed-on-branch + staged + unstaged in one pass,
# since `git diff <ref>` with no second ref and no --cached compares the
# working tree to <ref>), plus untracked files as a second pass.
pr_self_review_changed_files() {
  local mb
  mb="$(pr_self_review_merge_base)"
  {
    git diff --name-only --find-renames "$mb"
    git ls-files --others --exclude-standard
  } | LC_ALL=C sort -u
}

# Same file list, with a status letter per file: git's own name-status
# letters for tracked changes (M/A/D/R100 …), "??" for untracked — the same
# convention `git status --porcelain` uses, so it reads familiarly.
pr_self_review_changed_files_with_status() {
  local mb
  mb="$(pr_self_review_merge_base)"
  {
    git diff --name-status --find-renames "$mb"
    git ls-files --others --exclude-standard | sed $'s/^/??\t/'
  }
}

# The freshness fingerprint. Must hash CONTENT, not `git status --porcelain`
# output — porcelain is byte-identical before and after a further edit to a
# file already listed as modified, which is exactly the staleness case this
# exists to catch (review -> edit one more file -> push).
#
# Untracked files are hashed by path+blob so a brand-new file also flips the
# fingerprint. `git ls-files --others --exclude-standard` already skips
# gitignored paths, which is what keeps writing the report itself from
# invalidating the fingerprint it just computed (.devdigest/ is gitignored).
pr_self_review_fingerprint() {
  local mb
  mb="$(pr_self_review_merge_base)"
  {
    printf 'v1\nHEAD %s\nMB %s\n' "$(git rev-parse HEAD)" "$mb"
    git diff --no-color --no-ext-diff --find-renames "$mb"
    git ls-files --others --exclude-standard -z \
      | LC_ALL=C sort -z \
      | while IFS= read -r -d '' f; do
          printf '%s %s\n' "$f" "$(git hash-object -- "$f" 2>/dev/null || echo MISSING)"
        done
  } | git hash-object --stdin
}

# True if any changed file matches one of the given glob-ish prefixes.
# Bash-glob, not a real gitignore matcher — fine for the coarse
# "which package(s) does this diff touch" question these scripts ask.
pr_self_review_touches() {
  local prefix="$1"
  shift
  local f
  for f in "$@"; do
    case "$f" in
      $prefix*) return 0 ;;
    esac
  done
  return 1
}
