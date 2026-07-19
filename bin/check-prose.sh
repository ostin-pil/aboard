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

resolve_tool() {
  if command -v prose-mint >/dev/null 2>&1; then
    command -v prose-mint
    return 0
  fi
  if [[ -x "$HOME/Projects/prose-mint/bin/prose-mint" ]]; then
    echo "$HOME/Projects/prose-mint/bin/prose-mint"
    return 0
  fi
  return 1
}

if ! TOOL="$(resolve_tool)"; then
  # Deliberately exit 0, not 1. The caller treats non-zero as "findings to
  # rewrite" and re-scans until clean, so failing closed here would spin
  # forever on a machine that simply lacks the tool. Loud on stderr instead,
  # so a skipped gate is visible rather than silent.
  echo "check-prose: prose-mint not found (PATH or ~/Projects/prose-mint/bin) — GATE SKIPPED, prose unchecked." >&2
  exit 0
fi

# When scanning stdin there is no file to discover config from, so anchor
# discovery at the repo root explicitly.
if [[ " $* " == *" --stdin "* ]] && [[ " $* " != *" --config "* ]]; then
  ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  if [[ -f "$ROOT/.prose-mint.toml" ]]; then
    exec "$TOOL" scan --config "$ROOT/.prose-mint.toml" "$@"
  fi
fi

exec "$TOOL" scan "$@"
