---
name: issues
description: Track, search, and manage development issues and their solutions
allowed-tools: Read Write Edit Grep Glob Bash
---

Manage the project issue tracker at `knowledge/issues.md`.

## Commands

Parse the user's argument to determine the action:

### `/issues` (no argument) — List all issues
- Read `knowledge/issues.md`
- Show a summary table: ID, title, status, date

### `/issues add <description>` — Add a new issue
- Read `knowledge/issues.md` to get the next ISS number
- Create `knowledge/issues.md` and the `knowledge/` directory if they don't exist
- Create a new entry with the standard format (see below)
- Ask for any missing fields: symptom, root cause, fix, files, session number
- Write the updated file

### `/issues search <query>` — Search for related issues
- Grep `knowledge/issues.md` for the query terms
- Also search session logs in `sessions/` for related mentions
- Report matching issues with their status

### `/issues update <ISS-NNN> <status/info>` — Update an existing issue
- Find the issue by ID
- Update its status, add notes, or mark as resolved
- Include commit hash if available

### `/issues verify` — Check "Resolved (verify)" issues
- Find all issues with status "Resolved (verify)"
- Check the referenced files to see if the fixes are still present
- Update status to "Resolved" if confirmed, or "Regressed" if the fix was lost

## Entry Format

```markdown
## ISS-NNN: Short title
**Session**: N | **Date**: YYYY-MM-DD | **Status**: Open|Resolved|Resolved (verify)|Regressed

**Symptom**: What the user sees or experiences.

**Root Cause**: Why it happens.

**Fix**: What was done to resolve it.

**Commit**: `abc1234` (if available)

**Files**: List of affected files (if applicable)
```

## Status Values
- **Open** — Known issue, not yet fixed
- **Resolved** — Fixed and confirmed
- **Resolved (verify)** — Fixed but needs verification (e.g., may have been reverted)
- **Regressed** — Was fixed but the fix was lost

## Guidelines
- Always read the current file before writing to avoid data loss
- Increment the ISS number sequentially
- Link to session logs where the issue was discovered/fixed
- If an issue relates to a knowledge base entry, cross-reference it
