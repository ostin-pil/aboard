---
name: session-start
description: Brief the user on where aboard left off and suggest the next slice, using recent session logs and git history
allowed-tools: Bash Read Glob Grep AskUserQuestion
---

Produce a concise in-chat briefing for starting a new aboard work session. Read-only on repo content (no Write/Edit), but may run `git fetch` and `git switch -c` so the session opens on a clean per-session branch.

Counterpart to `/session-end`, which finalizes a session. This is the
"where am I?" command; `/session-end` is the "wrap it up" command.

## Argument

`$ARGUMENTS` is an optional focus area (e.g. `graph`, `dossier`, `schema`, `forecasts`). If given, bias the "Suggested next slice" picks toward items in that area. If absent, suggest broadly.

## Steps

1. **Preflight — divergence check.** `git fetch origin main 2>/dev/null` (silent failure is fine — offline is OK). Then compare `git rev-list --left-right --count origin/main...main` and `git rev-list --left-right --count main...HEAD` to detect three failure modes a parallel terminal can introduce:
   - Local `main` is behind `origin/main` — another machine pushed.
   - Local `main` has commits ahead of `origin/main` *and* the user is unaware (rare).
   - `HEAD` is on a `feature/*` branch but the user thinks they're on `main` (or vice-versa).
   Surface any of these in the briefing's "Where we left off" line; don't silently move on.
   Also count stale merged local branches:
   `git branch --merged main | grep -vE '^\*| main$' | wc -l`. If on an
   up-to-date `main` and the count is > 0, carry it to step 6.

2. **Find the latest session log.** `ls sessions/ 2>/dev/null | sort | tail -3` — the lexicographically last `YYYY-MM-DD_session*.md` file (prefer non-worktree-suffixed ones if multiple share a date). Read it in full, focusing on `## What's next`, `## Build status`, `## Commits`, and the branch line at the top. Also note the highest session number from filenames — needed in step 6. If no `sessions/` directory or no logs exist, note "no prior sessions" and skip ahead.

3. **Diff against current git state.**
   - Get the last commit hash mentioned in the session log's `## Commits` section (if any).
   - `git log --oneline <that-hash>..HEAD` — anything shipped after the log was written.
   - `git status --short` — uncommitted work-in-progress to flag.
   - `git branch --show-current` — confirm current branch matches the session's branch.

4. **Pull open follow-ups.**
   - From the session log's `## What's next` (Immediate + Candidate next slices).
   - From `knowledge/issues.md` if it exists — entries whose status is not Resolved/Closed (look for `Status:` lines or section headers).
   - Dedupe.

5. **Skim `README.md`** for project structure context only if a follow-up references a specific module. Don't quote it in the briefing — just use it to disambiguate.

6. **Print the briefing in chat** with these sections:

   - **Where we left off** — one short paragraph (branch, last session number, what landed, build status). Include the divergence flag from step 1 if any.
   - **Shipped since the last log** — bullets from step 3's `git log`, or "no commits since last log".
   - **Uncommitted work** — flag dirty files from `git status`, or "clean tree".
   - **Open follow-ups** — bulleted, deduped list from step 4. If step 1
     found stale merged local branches, add a bullet: "N merged local
     branches can be pruned — run `/prune-branches`" with the note that
     it must run *before* accepting step 7's branch switch (`/prune-branches`
     requires being on `main`).
   - **Suggested next slice** — 1–2 picks with a one-line rationale each. Bias by `$ARGUMENTS` if given. Phrase as a recommendation, not a decision.

7. **Branch isolation.** After the briefing, ask the user via `AskUserQuestion` whether to open this session on a new feature branch. Compute the next session number `N` from the highest `_session_<n>` in `sessions/` (step 2), plus 1. Suggest `feature/session-<N>-<short-topic>` where `<short-topic>` is a one-word slug derived from `$ARGUMENTS` or the picked next slice (e.g. `live-forecasts`, `multi-domain`, `schema`). Two answers:
   - **Yes** — run `git switch -c feature/session-<N>-<topic>` and report the new branch. From here, all session commits land there; `/session-end` will merge it back.
   - **No, stay on the current branch** — proceed without switching. Use this for trivial one-commit doc fixes.
   If `git status` is dirty (step 3 flagged it), do NOT switch — print a warning that uncommitted work would follow the branch and ask the user to handle it first.

## Constraints

- Repo content is read-only: no Write, no Edit, no commits, no file creation in the working tree.
- Allowed git mutations: `git fetch` (always safe) and `git switch -c <new-branch>` (only when the user accepts step 7's suggestion). No `git switch` to an existing branch — that mutates HEAD silently. No `git push`, no `git reset`, no `git merge`.
- Keep the briefing to ~30 lines — summarize, don't paste.
- If the latest session is several days stale and `git log` shows substantial activity since, say so explicitly so the user knows the "what's next" list may be outdated.
- No emojis.
