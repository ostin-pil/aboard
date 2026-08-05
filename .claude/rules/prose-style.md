# Prose style

What the prose gate checks, where it is relaxed, and why. Referenced by
`prose_rule` in `.claude/lifecycle-manifest.md`; the executable gate is
`bin/check-prose.sh` (`prose_gate`).

## What runs, and when

`bin/check-prose.sh` wraps
[prose-mint](https://github.com/ostin-pil/claude-plugins/tree/main/prose-mint),
which scans markdown for structural AI-writing tells: em dashes, ASCII arrows,
"not X but Y", bold-colon openers, AI-attribution boilerplate, hard-wrapped
paragraphs, and a few more.

It fires in two places:

- **Session end.** `/lifecycle-kit:session-end` scans the PR body before the
  merge gate, and rewrites-and-rescans until clean. This is the one that
  matters: PR bodies are the most-read prose the project emits and the least
  reviewed.
- **On demand.** `/prose-check <path|PR#>` for a doc or PR you want checked
  outside the session flow. Read-only; it reports and does not edit.

Nothing runs in CI. This is a style gate on human-facing prose, not a
correctness gate on the product, and it has no business failing a build.

## Where it is relaxed, and why

`plans/` and `sessions/` ship their own `.prose-mint.toml` that disables the
`hard-wrap` category. Both directories hard-wrap at ~76 columns by long-standing
convention; the detector would flag the convention itself on every file. The
exemption is per-directory rather than global because prose-mint discovery walks
up from each scanned file and stops at the first config it finds.

Two things this is not. It is not an em-dash exemption: every other category
still runs in those directories. And it is not a claim that hard wrapping is
wrong elsewhere; it is scoped to the two trees that actually do it.

The root `.prose-mint.toml` only narrows `[scope]` for the `bulk` surface, so
imported mockups (`Claude Design Screens/`), build output, and worktrees are not
walked. Detector settings there are the shipped defaults.

## If the gate is skipped

`bin/check-prose.sh` exits 0 with a loud stderr warning when prose-mint is not
installed, rather than failing closed. The caller treats a non-zero exit as
"findings to fix" and re-scans until clean, so failing closed on a missing tool
would spin forever. A skipped gate is therefore visible in the session-end
output but not fatal. Install prose-mint (or put it on `PATH`) to re-arm it.

## Judgement still applies

A finding is a prompt to look, not a verdict. An em dash in a quoted source, a
`→` in a file-path diagram, or a bold-colon opener in a genuine definition list
are all fine. Rewrite what reads better rewritten; keep what does not. The gate
exists to catch the unconsidered habit, not to enforce a dialect.
