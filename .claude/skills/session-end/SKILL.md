---
name: session-end
description: Finalize today's aboard work session — update the session log, gate it with type-check + build, and commit the log
allowed-tools: Bash Read Edit Write Glob Grep
---

Finalize the current aboard work session. Counterpart to `/session-start`.

This skill is the end-of-work wrap-up: record what happened, verify the
tree still type-checks and builds, and commit the session log.

## Phase selection

Not every session needs every phase. Phase selection determines which
phases to run. There are two modes: **auto-detect** (default) and
**manual flags** (when `$ARGUMENTS` contains any `--skip-*` or `--full`
flag).

### Mode A — Auto-detect (default, no flags provided)

Inspect the session's changes to classify them:

```bash
# Files changed in commits on this branch + uncommitted changes
{ git diff main --name-only 2>/dev/null; git diff --name-only; git diff --cached --name-only; } | sort -u
```

Classify the session based on what files changed:

- **Code session** — any file under `src/` (`.ts`, `.tsx`, `.css`, `.json`) or
  any file under `scripts/` in the diff → run ALL phases.
- **Config/docs session** — only non-code files changed (`.md`, top-level
  `.json` config, files under `.claude/`, `sessions/`, `research/`,
  `public/`) → run phases 2, 2.5, and 5 only. Skip build gate (phase 1).
- **No changes** — nothing in the diff → run phases 2 and 5 only (log
  the session even if it was research/discussion-only, skip the commit
  in 2.5 if the log is unchanged).

Print the detected session type and which phases will run before
starting:

```
Session type: config/docs (no src/ changes)
Phases: 2 (session log), 2.5 (commit log), 5 (report)
Skipping: 1 (build/typecheck gate)
```

### Mode B — Manual flags (any flag present in `$ARGUMENTS`)

When `$ARGUMENTS` contains one or more flags, skip auto-detection and
use the flags to control which phases run:

| Flag                | Effect                                    |
|---------------------|-------------------------------------------|
| `--skip-build`      | Skip phase 1 (type-check + build gate)    |
| `--full`            | Force ALL phases regardless of other flags |

`--full` overrides everything — all phases run unconditionally.

Print the active flags and resulting phase plan before starting.

## Phases

Run selected phases in order. If a phase fails, report clearly and
stop — do not paper over failures or proceed to later phases.

### Phase 1 — Type-check + build gate

*Skippable via auto-detect (config/docs session) or `--skip-build`.*

Before writing any log, confirm the working tree is healthy. Results of
this phase get folded into the session log's `## Build status` section.

```bash
npx tsc --noEmit 2>&1 | tail -10
npm run build 2>&1 | tail -20
```

Record for the log:

- `tsc --noEmit` — clean / failed (with first error)
- `npm run build` — clean / failed (with first error)

If either fails, **still write the session log** so today's work is
preserved, but mark `## Build status` accordingly. The user decides
whether to fix forward or roll back.

When phase 1 is skipped, pass `"build/typecheck: skipped (no src/ changes)"`
to `/session-report` so the log records why no build status exists.

### Phase 2 — Write/update today's session log

*Always runs.*

Delegate to `/session-report`, passing the verbatim `tsc` / `npm run build`
summary from phase 1 as its argument so it can fold the result into
`## Build status` without re-running the checks.

Do **not** reimplement the log-writing logic here — `/session-report`
owns the format, the filename convention (including worktree suffix),
the "append, don't overwrite" rule, and the session-number bookkeeping.
This phase is complete when `/session-report` reports it has updated
or created the session file.

### Phase 2.5 — Commit the session log

*Always runs (no-ops if nothing to commit).*

The session log is a real artifact and must be committed.

1. **Survey the working tree.** `git status --porcelain` — classify each
   line:
   - The session log file written by phase 2 (matching
     `sessions/YYYY-MM-DD_session*.md`) — **commit this**.
   - Other uncommitted tracked files — **do not touch**. These are the
     user's in-progress work and the atomic-commits rule
     (`.claude/rules/workflow.md`) says they need their own logical-unit
     commits from the user.
   - Untracked files, ignored noise (`.claude/settings.local.json`, etc.)
     — ignore.

2. **Stage and commit only the session log:**
   ```bash
   git add sessions/YYYY-MM-DD_session<N>[_<suffix>].md
   git commit -m "docs(sessions): add session <N> log for <short topic>"
   ```
   Use the existing project convention for commit messages (see
   `CLAUDE.md` §Commits). No `Co-Authored-By`. Title under 72 chars.
   Prefer `add` for a new log, `update` for an appended one.

3. **If other tracked files are still dirty**, print a warning listing
   them and note that the user should commit them separately. Then
   continue to phase 5 — the session log has been committed, so nothing
   is lost.

4. **If the only dirty file was the session log**, report the commit
   hash and proceed to phase 5.

### Phase 5 — Report

*Always runs.*

Print a short summary:

```
✓ npx tsc --noEmit / npm run build
✓ sessions/2026-05-08_session_3.md updated
✓ committed <sha> — docs(sessions): ...
```

For skipped phases, use `—` instead of `✓` or `✗`:

```
— npx tsc --noEmit / npm run build (skipped, config/docs session)
✓ sessions/2026-05-08_session_3.md updated
✓ committed <sha> — docs(sessions): ...
```

If any phase failed, replace the check with `✗` and the failure reason.

## Rules

- **Never push.** Pushing is always the user's call.
- **Never force-delete branches.**
- **No emojis** in the session log.
