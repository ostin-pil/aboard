#!/usr/bin/env bash
#
# Prose gate for the lifecycle-kit session flow (`prose_gate` in
# .claude/lifecycle-manifest.md). A thin resolver around prose-mint: every
# argument is forwarded verbatim to `prose-mint scan`, so the kit's call
#
#   gh pr view <n> --json body -q .body |
#     "$(git rev-parse --show-toplevel)/bin/check-prose.sh" --stdin --strict --label "PR #<n>"
#
# works unchanged, as does a direct `bin/check-prose.sh --file plans/foo.md`.
#
# Exit codes: 0 clean (or gate skipped), 1 findings under --strict.
#
# Config is discovered by prose-mint itself, walking up from the scanned file:
# `.prose-mint.toml` at the repo root, overridden in plans/ and sessions/ where
# hard wrapping is the house style. See .claude/rules/prose-style.md.
set -euo pipefail

# Which published version the gate runs. Empty tracks the latest release, which
# is what the prose-mint plugin's own resolver does. Set to an exact version
# (e.g. 0.1.1) to make the gate reproducible over time as well as across
# machines; the cost is bumping it on each prose-mint release.
PROSE_MINT_VERSION="${PROSE_MINT_VERSION:-}"

# Resolution order. An explicit install on PATH wins, because that is the
# operator naming the build to use. Otherwise `uvx`, which runs a published
# release without installing anything.
#
# There is deliberately no local-checkout fallback. This used to try
# ~/Projects/prose-mint/bin/prose-mint, which on this machine is a symlink into
# the claude-plugins working tree, so the gate ran whatever branch that
# checkout was on, uncommitted edits included, with nothing in the output
# saying so. See knowledge/issues.md, 2026-08-05.
resolve_tool() {
  if command -v prose-mint >/dev/null 2>&1; then
    TOOL=("$(command -v prose-mint)")
    return 0
  fi
  if command -v uvx >/dev/null 2>&1; then
    TOOL=(uvx "prose-mint${PROSE_MINT_VERSION:+==$PROSE_MINT_VERSION}")
    return 0
  fi
  return 1
}

if ! resolve_tool; then
  # Deliberately exit 0, not 1. The caller treats non-zero as "findings to
  # rewrite" and re-scans until clean, so failing closed here would spin
  # forever on a machine that simply lacks the tool. Loud on stderr instead,
  # so a skipped gate is visible rather than silent.
  echo "check-prose: prose-mint not found (no prose-mint on PATH, no uvx) — GATE SKIPPED, prose unchecked." >&2
  exit 0
fi

# When scanning stdin there is no file to discover config from, so anchor
# discovery at the repo root explicitly.
if [[ " $* " == *" --stdin "* ]] && [[ " $* " != *" --config "* ]]; then
  ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  if [[ -f "$ROOT/.prose-mint.toml" ]]; then
    exec "${TOOL[@]}" scan --config "$ROOT/.prose-mint.toml" "$@"
  fi
fi

exec "${TOOL[@]}" scan "$@"
