---
name: commit
description: Stage and commit changes following the project's prefix(topic) convention
allowed-tools: Bash Read Grep Glob
---

Commit pending changes using the project convention: `prefix(topic): short description`

## Arguments

- No arguments: auto-generate the commit message from the diff
- `$ARGUMENTS` provided: use it as the commit message (must still follow convention)

## Process

1. Run `git status` (never use `-uall`) and `git diff` to see all pending changes
2. **Exclude** these from staging — never commit them:
   - `.env`, `credentials.json`, secrets
   - `node_modules/`, `.next/`, `out/`, `build/`
   - `/tmp/` debug logs, scratch files
   - `.DS_Store`
3. Stage all remaining changed/new files with `git add <file>...` (list files explicitly, never `git add -A`)
4. If `$ARGUMENTS` is provided, use it as the commit message. Otherwise, analyze the diff and generate one:
   - **Prefix** — infer from the nature of the change:
     - `feat` — new feature or capability
     - `fix` — bug fix
     - `docs` — documentation, session logs, research
     - `chore` — config, scripts, tooling, dependencies
   - **Topic** — the area of the codebase, e.g.: `claims`, `graph`, `dossier`, `forecast`, `schema`, `jsonld`, `ui`, `data`, `lib`, `scripts`, `research`, `sessions`, `config`, `deps`, `claude`
   - **Description** — concise, lowercase, under 72 chars total, focuses on "why" not "what"
5. Commit using a HEREDOC (no `Co-Authored-By` trailer, ever):
   ```
   git commit -m "$(cat <<'EOF'
   prefix(topic): short description
   EOF
   )"
   ```
6. Report: show the commit hash and full message

## Rules

- One logical change per commit — if changes span unrelated areas, ask the user to split
- Title must be under 72 characters
- Never add `Co-Authored-By` trailers
- Never use `git add -A` or `git add .`
- If there are no changes to commit, say so and stop
