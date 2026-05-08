---
name: report
description: Generate a project status report from git history, session logs, and research docs over a given time or commit range
allowed-tools: Bash Read Glob Grep Write
---

Generate a project status report for aboard. The report covers: what was achieved, research conducted, current state, and what's next.

## Argument Parsing

The user passes `$ARGUMENTS` which can be one of these forms (all optional — no argument means "everything"):

**Audience flag (can appear anywhere in the arguments):**
- `plain` — write the report for a non-technical audience (see Plain Mode below)
- If `plain` is absent, produce the default developer-oriented report

**Time-based:**
- `last week`, `last 3 days`, `today`, `yesterday` — human-readable relative ranges
- `Apr 8`, `2026-04-08` — single date (from that date to now)
- `Apr 8-10`, `2026-04-08..2026-04-10` — date range (inclusive)
- `..Apr 10`, `..2026-04-10` — up to that date (from the beginning)

**Git-based:**
- `abc1234` — single commit hash (from that commit to HEAD)
- `abc1234..def5678` — commit range
- `..def5678` — from the beginning up to that commit

Strip `plain` from the arguments before parsing the time/git range.

Parse the argument and determine:
- `GIT_SINCE` / `GIT_UNTIL`: for `git log --since/--until` (time-based)
- `GIT_RANGE`: for `git log <range>` (hash-based)
- `SESSION_DATE_FILTER`: which session files to include

If no argument is given (after stripping flags), include all history.

## Steps

1. **Gather git history** for the determined range:
   ```
   git log --oneline [--since=X] [--until=Y] | head -60
   ```
   or for hash ranges:
   ```
   git log --oneline <range>
   ```

2. **Identify session logs** in `sessions/` that fall within the range. Session files are named `YYYY-MM-DD_session*.md`. Filter by date extracted from filenames. Read all matching session files. Skip if `sessions/` does not exist.

3. **Identify research docs** in `research/`. Read the first ~30 lines of each to get title, date, and purpose. Include research docs whose dates fall within the range (check file content for date, or use git log to find when they were added).

4. **Read README.md** for project structure context if needed to disambiguate references.

5. **Compile the report** with these sections:
   - **Header**: "aboard — Status Report {REPORT_END_DATE}" with the date range covered
   - **Research Conducted**: Table of research docs with file, session, and summary. Skip this section if no research falls in range.
   - **What Was Achieved**: Organized by day, with a table of features and their status. Derived from session logs and git commits.
   - **Current State**: What's working now, what's not yet tested, known gaps.
   - **What's Next**: Immediate priorities + roadmap items. Derived from session "next steps".

6. **Save the report** to `reports/Status Report {REPORT_END_DATE}.md` (create the `reports/` directory if missing, overwrite if the file exists). `REPORT_END_DATE` is the end of the reporting range in `YYYY-MM-DD` form — the explicit end date if provided, otherwise today. Tell the user the file path after saving.

## Formatting Rules

- Use GitHub-flavored Markdown tables where appropriate
- Keep it concise — summarize, don't copy entire session logs
- Use `code formatting` for file paths and commands
- No emojis unless the user requests them

## Plain Mode

When `plain` is present in the arguments, rewrite the entire report for a non-technical audience (e.g. stakeholders, funders, journalists, designers). The data-gathering steps are identical — only the output changes.

**Language rules for plain mode:**
- No commit hashes, file paths, function names, class names, or code formatting
- No internal jargon (schema, JSON-LD, ORM, hook, Drizzle, Zod, etc.)
- Write in first person singular ("I built", "I added", "I improved") — solo project
- Describe outcomes in terms of what the system can do now, not how the code changed
- "I added a way to attach forecasts to causal mechanisms" not "wired up Forecast → Mechanism FK"
- "Fixed several stability issues" not "guarded against undefined returns from getDossierForClaim"

**Section adjustments for plain mode:**
- **Research Conducted** → **Research & Investigation**: drop the file column, keep a plain-English summary
- **What Was Achieved**: use prose paragraphs or simple bullet lists instead of tables. Group by theme (e.g. "Claim graph", "Forecasts", "Schema and JSON-LD") not by session number
- **Current State**: split into "What's working" and "Known limitations" in plain language
- **What's Next**: frame as product priorities, not engineering tasks
- **Commit summary**: omit entirely

**File naming:** save as `reports/Status Report {REPORT_END_DATE} (plain).md` so it doesn't overwrite the technical version.
