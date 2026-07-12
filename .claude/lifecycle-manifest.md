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
code_globs: ["*.ts", "*.tsx", "*.js"]
build_commands: ["npx tsc --noEmit", "npm run build"]
test_commands: []                    # no test suite yet; the type-check + build above are the gate
subpkg_guard: none

# merge
merge_strategy: merge                # aboard lands PRs as merge commits

# prose gate (optional; none disables the step)
prose_gate: none                     # prose-mint is installed but not enforced as a gate
prose_rule: none

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
