---
name: prune-branches
description: Delete local branches already merged into main, gated on `git branch --merged main`
allowed-tools: Bash AskUserQuestion
---

Post-merge hygiene. This repo's workflow (work on `feature/session-N-*` /
`track-*` branches → PR from the `ostin-pil` fork → merge commit on
GitHub → pull `main`) leaves stale local branches every cycle. They clog
`git branch` and produce confusing `git status` "ahead N" lines because
they still track the now-merged PR head.

The non-obvious trap this skill exists to encode: `git branch -d` will
**refuse a fully-merged branch** ("not fully merged") when that branch's
upstream is the stale/merged PR head — even though the branch *is*
merged into `main` (HEAD). `git branch --merged main` is the truth; for
branches it lists, `-D` is safe even when `-d` balks.

## Argument

`$ARGUMENTS` — optional `--yes` to skip the force-delete confirmation
(non-interactive use). Anything else is ignored.

## Preconditions — all must hold; abort (delete nothing) otherwise

1. **On `main`.** `git branch --show-current` is `main`. Else abort:
   "switch to main first — pruning runs from main".
2. **`main` == `origin/main`.** `git fetch origin main` then
   `git rev-list --left-right --count origin/main...main` is `0  0`.
   - Behind → abort: "local main is behind origin/main; pull first —
     'merged into main' would be measured against a stale main".
   - Ahead → abort: "local main has unpushed commits; resolve first".
3. **Clean tree.** `git status --porcelain` is empty. Else abort.

Abort = print the reason and stop. No deletions on a stale or dirty main.

## Steps

1. **Compute the merged set (source of truth).**
   `git branch --merged main | grep -vE '^\*| main$'` (trim whitespace).
   This is the *only* set eligible for deletion. Empty → print
   "no merged local branches to prune" and stop.
2. **Record recovery SHAs.** For each candidate, `git rev-parse --short
   <branch>`. Print the name→SHA table and note: recoverable for ~90
   days via `git branch <name> <sha>` / `git reflog`.
3. **Safe pass (batch).** Run `git branch -d` on *all* candidates in one
   command. Capture which were `Deleted` and which were refused
   ("not fully merged").
4. **Reconcile refusals.** Every refused branch must still be in the
   step-1 merged set — `-d` refused only because the upstream is the
   stale PR head, not because of unmerged work. Compute
   `refused ∖ merged-set`: it must be empty. If any refused branch is
   *not* in the merged set, that is an anomaly — do **not** delete it;
   report it and keep it.
5. **Force pass (verified subset only).** If the refused-but-merged
   subset is non-empty, confirm via `AskUserQuestion` (skip the prompt
   if `--yes` was passed). The confirm option's description must explain
   *why* it is safe — e.g. "Refused by `-d` only because their upstream
   is the stale pre-merge PR head, not because they hold unmerged work;
   `git branch --merged main` confirms they are in main; local-only;
   recoverable via reflog." On confirm: `git branch -D <subset>`. On
   decline: keep them, report.
6. **Report.** Deleted (with SHAs), force-deleted (with SHAs), kept and
   why. Confirm `git branch -r` is unchanged — origin is never touched.

## Rules

- **Load-bearing invariant:** never `-d`/`-D` a branch absent from
  `git branch --merged main` taken on an up-to-date local `main`. That
  single fact is the only thing that makes force-delete safe.
- Preconditions are hard gates, not warnings. "Merged into main" is
  meaningless against a stale or dirty `main` — abort, delete nothing.
- Local-only. Never delete, prune, or push branches on `origin`. Remote
  pruning is deliberately out of scope; do it by hand with
  `git push origin --delete <branch>` if ever needed.
- Never delete `main` or the current branch.
- Always print recovery SHAs before any deletion.
- No emojis.
