---
name: session-report
description: Update or create today's session log in the sessions/ folder
allowed-tools: Bash Read Edit Write Glob Grep
---

Update the session log for today's work. This is the report-writing half
of the session lifecycle — it records what happened. No build gating and
no worktree finalization. `/session-end` invokes this skill as one of its
phases; you can also run it standalone to checkpoint mid-session.

1. Check for today's session file: `sessions/YYYY-MM-DD_session.md` (use current date)
   - If multiple sessions exist for today (e.g. `_session_2.md`, `_session_25.md`), use the latest one.
   - Session numbers increment across the whole project, not per-day — look at the highest `_session_N` in `sessions/` to pick the next one if creating a new file.
   - If none exists, create one. Create the `sessions/` directory if it does not exist.
   - If running as a worktree agent on a feature branch, use a workstream suffix:
     e.g. `sessions/YYYY-MM-DD_session_N_schema.md` or `_N_ui.md`.
     This prevents merge conflicts when parallel agents each write session logs.
2. Read the current session file and the previous one for format reference (if any).
3. Update the session file with:
   - `## Context` — 1-paragraph framing
   - `## What happened` — numbered sections with details
   - `## Files changed` — table: file | change
   - `## Build status` — `npx tsc --noEmit` and (if relevant) `npm run build` result. If the caller (e.g. `/session-end`) passed pre-computed output via `$ARGUMENTS`, fold it in verbatim rather than re-running the commands. Otherwise mark as "not re-run this session" — do not run build/test from this skill.
   - `## Decisions worth remembering` — non-obvious calls made
   - `## What's next` — immediate + deferred
   - Branch name at the top if on a feature branch
4. Keep the format consistent with existing session logs in `sessions/`.
5. Do not remove existing content — append or update sections as needed.
6. No emojis.

## Arguments

`$ARGUMENTS` is optional. If the caller (typically `/session-end`) passes
pre-computed build/test output, fold it into `## Build status` verbatim.
