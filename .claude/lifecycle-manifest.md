# Lifecycle manifest

Project config for the `lifecycle-kit` and `knowledge-kit` plugins. Their skills
read this file at runtime; it is the only place aboard's per-project values live.
See the kits' `lifecycle-manifest.template.md` and `manifest-keys.md` for the full
key reference.

```yaml
# product
product_name: aboard

# git integration
remote: origin
integration_ref: origin/main         # remote integration branch (authoritative)
local_main: main                     # local integration branch
pr_base: main                        # base branch for the session PR
requires_remote: true                # finalize/cleanup need a fetchable remote + gh-driven PR

# branches & worktrees
branch_pattern: "feature/session-{n}-{topic}"
branch_glob: "feature/*"
docs_log_branch: "docs/session-{n}-log"
worktree_dir: .claude/worktrees
worktree_pattern: "session-{n}-{topic}"
worktree_ignore: .git/info/exclude   # machine-local ignore, not committed
orphan_branch_globs: ["feature/session-*", "feat/*", "fix/*", "docs/*", "chore/*"]

# session logs
log_dir: sessions
log_archive: sessions/archive
log_index: sessions/INDEX.md
log_pattern: "{date}_session_{n}[_{suffix}].md"   # date = YYYY-MM-DD
log_glob: "sessions/[0-9]*_session*.md"
log_presence_regex: '^sessions/[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}_session.*\.md$'

# build / test gate (run in order, abort on first failure)
# Every glob here is paired with a command below that actually reads it; a glob
# without one classifies a session as code and then verifies nothing, which is
# worse than skipping, because a green gate reads as verification.
#   *.ts/*.tsx  tsc, vitest, next build          (root tsconfig only)
#   *.ts/*.tsx  check:exports                    (dead exports, session 56)
#   *.ts        typecheck:mcp, typecheck:clients (the two excluded sub-packages)
#   *.sh        shellcheck                       (session 45)
#   *.js/*.mjs  eslint                           (session 46)
#   *.yaml      next build                       (data/, session 53)
#   *.yml       check:config                     (ci.yml, session 53)
#   *.jsonc     check:config                     (wrangler.jsonc, session 53)
# tsconfig's include covers *.ts/*.tsx/*.mts but not *.js or *.mjs, and vitest
# only reads src/**/*.test.ts, so eslint is the one command in this gate that
# reads them. It was already a hard gate in CI and was missing here.
#
# The root tsconfig also *excludes* clients and mcp-server, so "*.ts" only ever
# half-covered its own glob: a type error in either package passed all six
# commands. Session 48 proved that by planting one in each. They now have
# readers of their own, which is what makes the glob honest.
#
# The three globs session 53 added were each blocked on the same thing: a
# reader. Session 48 left "*.jsonc" out for exactly that reason and said so
# here, which was the right call at the time and became the to-do list.
#
# Measured before fixing, the way sessions 45, 46 and 48 did it. A YAML syntax
# error in ci.yml and a JSON syntax error in wrangler.jsonc, planted together:
# all nine gate commands exit 0. `npm run check:config` is the reader those two
# now have, and it does more than parse them — it also enforces gate/CI parity
# and the rate-limit period that wrangler.jsonc and worker/index.ts each
# document as mirroring the other, with nothing checking it.
#
# The two files fail differently, which is why the new check runs in CI as well
# as here. A broken wrangler.jsonc turns CI's dry-run step red. A broken ci.yml
# cannot be caught by ci.yml: the workflow does not parse, so it does not run,
# and the failure looks like CI having nothing to say.
#
# The "*.ts"/"*.tsx" pair gained a second reader in session 56 for a reason the
# other entries here do not have: it was already covered, and covered honestly,
# by commands that still could not see this class of fault. tsc runs without
# noUnusedLocals, and eslint's no-unused-vars treats an exported symbol as used
# by definition, so a declaration nothing imports passes every command in this
# list forever. Session 54 caught `useGraphInstance` by reading the code. Run
# once against the tree it was added to, check:exports named 30 more.
#
# "*.jsonc" now has a second reader too, since knip.jsonc is where the entry
# points and the two argued exemptions live. A fault there does not fail
# silently the way ci.yml does: knip exits non-zero on an unparseable config.
#
# "*.yaml" is the one that was never a config gap at all. Everything under data/
# is *.yaml, so a session that only edits a forecast matched no glob, classified
# as docs, and skipped the build — and the build is the data gate, running the
# Zod loader and the referential-integrity checks. Probe: probability 1.7 on
# F1.yaml, which `npm run build` rejects naming the file and the field, and
# which the session gate would never have run.
code_globs: ["*.ts", "*.tsx", "*.js", "*.mjs", "*.sh", "*.yaml", "*.yml", "*.jsonc"]
build_commands: ["shellcheck $(git ls-files '*.sh')", "npm run check:config", "npx tsc --noEmit", "npm run lint", "npm run check:exports", "npm run typecheck:mcp", "npm run typecheck:clients", "npm run lint:resolution -- --strict", "npm run build", "npm run check:built-urls"]
test_commands: ["npm test"]          # vitest, unit tests over the pure lib modules
# none, because the two sub-package commands provision themselves: each is
# `test -d node_modules || npm ci` before its typecheck, so it fails closed on a
# real error instead of skipping quietly on a fresh clone. A guard here would
# reintroduce the fail-open the rest of this gate was just fixed to avoid.
subpkg_guard: none

# merge
merge_strategy: merge                # aboard lands PRs as merge commits

# prose gate (optional; none disables the step)
prose_gate: bin/check-prose.sh       # prose-mint wrapper; resolve via `git rev-parse --show-toplevel`
prose_rule: .claude/rules/prose-style.md

# code review (optional; none disables the step)
code_reviewer: none                  # use /code-review ad hoc
review_command: none

# commit / PR convention
commit_convention: "prefix(topic): short description"
commit_trailers: none                # no Co-Authored-By trailers, in commits or PR bodies
subject_max: 72

# project knowledge & docs
knowledge_dir: knowledge             # project-internal docs root (knowledge-audit scans this)
research_dir: research               # scanned recursively by report and knowledge-audit
reports_dir: reports                 # report output
audit_stale_days: 90                 # flag docs with no commit in this many days
issues_file: knowledge/issues.md     # ISS-NNN tracker for the issues skill
jargon_terms: ["claim graph", "JSON-LD", "dossier", "crux", "leverage point", "forecast", "frontmatter"]
plan_doc: none
workflow_rule: .claude/rules/workflow.md
scratch_paths: [.claude/settings.local.json, .claude/worktrees]

# session archive (knowledge-kit; all keys none-able)
archive_scope_default: cwd
archive_export_dir: .archive/sessions
archive_format: markdown
archive_home_redact: /Users/costa    # absolute home prefix rewritten to ~ in the export
archive_scrub_extra: none
archive_dest_default: none           # review a --dry-run redaction report before wiring a destination
archive_rsync_target: none
archive_gdrive_folder: none
archive_git_repo: none               # must be a SEPARATE private repo, never aboard itself
archive_git_branch: main
archive_retention_days: none
```
