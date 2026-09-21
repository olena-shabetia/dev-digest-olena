#!/usr/bin/env bash
#
# Checks that client/src/vendor/shared is byte-identical to the canonical
# server/src/vendor/shared (server/AGENTS.md: "the one under client/ is
# derived — edit the server one first, then sync").
#
# Usage:
#   ./scripts/check-vendor-sync.sh          # check only, exits 1 on drift
#   ./scripts/check-vendor-sync.sh --write  # one-way sync server → client
#
# --write is a plain copy, never a symlink or codegen step: Next.js cannot
# resolve an import across the package root, which is why this duplication
# exists in the first place (see client/INSIGHTS.md, 2026-09-17).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_SHARED="$ROOT/server/src/vendor/shared"
CLIENT_SHARED="$ROOT/client/src/vendor/shared"

if [[ ! -d "$SERVER_SHARED" ]]; then
  echo "error: $SERVER_SHARED not found" >&2
  exit 2
fi

if [[ "${1:-}" == "--write" ]]; then
  echo "Syncing $SERVER_SHARED → $CLIENT_SHARED (server is canonical)…"
  rm -rf "$CLIENT_SHARED"
  mkdir -p "$CLIENT_SHARED"
  cp -R "$SERVER_SHARED/." "$CLIENT_SHARED/"
  echo "Done. Review the diff before committing — this is a one-way, human-invoked copy."
  exit 0
fi

if diff -rq "$SERVER_SHARED" "$CLIENT_SHARED" >/tmp/vendor-sync-diff.txt 2>&1; then
  echo "OK: client/src/vendor/shared matches server/src/vendor/shared."
  exit 0
fi

echo "DRIFT DETECTED: client/src/vendor/shared has fallen behind server/src/vendor/shared." >&2
echo "(server/src/vendor/shared is canonical — see server/AGENTS.md)" >&2
echo >&2
cat /tmp/vendor-sync-diff.txt >&2
echo >&2
echo "Fix: review the drift, then run ./scripts/check-vendor-sync.sh --write" >&2
exit 1
