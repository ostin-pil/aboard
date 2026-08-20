# Workflow rules

The lifecycle invariants the kit's skills assume. This doc ships with the kit, so a project adopting it needs no companion file; the manifest's `workflow_rule` points here by default. Override it by pointing the key at your own copy if you maintain one. Commands below use the kit's `<key>` placeholders (`<integration_ref>`, `<local_main>`, `<branch_pattern>`); resolve them from `.claude/lifecycle-manifest.md`.

## Commit discipline

- Commit after every logical change (fix, feature, refactor, docs update).
- Do not batch unrelated changes into one commit.
- Do not wait to be asked; commit as soon as the change is complete and builds.
- Follow the project commit convention (`commit_convention`).
- A change spanning several files but forming one logical unit is one commit.
- Never commit debug artifacts, secrets, or temporary test code.

## Session lifecycle: one PR per session

The invariant everything else follows from: the session log is committed to an open branch before that branch's PR merges. It never lands on the integration branch directly and never on a branch whose PR has already merged.

- **Branch birth.** A session's branch (or worktree) is created from a freshly fetched integration ref, never from the current working tree: `git fetch <remote>` then `git switch -c <branch_pattern> <integration_ref>` (or the `git worktree add ... <integration_ref>` form). This removes the stale-base gotcha at its source.
- **One PR per session.** All of a session's work and its log live on that one branch. The branch is not merged until the log has been committed onto it. A session produces exactly one PR; the log rides it. Do not merge a session's work PR mid-session.
- **Never reopen a merged branch.** Once a PR merges, its branch is dead. Further work starts from a fresh branch off the integration ref.

Two exceptions, and only these two. Both preserve the invariant (the log is still committed to an open branch before its PR merges); neither is a default.

- **Research or discussion-only session** with no work branch: the log gets its own small `docs_log_branch` off the freshly fetched integration ref, and its own PR. This is the only sanctioned log-only PR.
- **Work that must merge mid-session** (for example to unblock dependent work): that unit is its own PR; the rest of the session continues on a fresh branch off the new integration ref, and the log rides whichever branch is still open at session end. Discouraged, not the default.

## Concurrent sessions: one worktree each

The one-PR-per-session model assumes a session owns its working tree. When two or more agent sessions touch the repo at the same time, they must not share the primary checkout. Two sessions in one checkout take turns moving a single HEAD, so one session's `git switch`, merge, or rebase silently moves the working tree under the other. That is a working-tree collision, distinct from a file conflict, and after-the-fact guards detect it but do not prevent it. This is a documented failure mode, not a hypothetical.

- **Each concurrent session runs in its own worktree**, created off the freshly fetched integration ref, never in the primary checkout:
  ```bash
  git fetch <remote>
  git worktree add <worktree_dir>/<worktree_pattern> -b <branch_pattern> <integration_ref>
  ```
  The worktrees share one `.git` store and the remote, so integration still runs through the integration branch and PRs. Worktree isolation covers the working tree and HEAD; it complements, never replaces, file-ownership partitioning when sessions edit shared code.
- **Stop-and-isolate signals.** A session starts in the primary checkout already parked on a feature branch that is not its own; or `git worktree list` shows only the primary checkout while another session is active. Either one means create a worktree before doing any branch work.

## Lifecycle skill design

These keep the skills correct under parallel sessions and flaky external tools.

- **Assert-then-reconcile, never assume.** A lifecycle step names a target end state, checks the actual state, and acts only if the target is unmet. It never encodes an imperative sequence built on an assumption about what an external tool (`gh`, `git`) did as a side effect. Every step is idempotent and safe to re-run. The recurring failure these guards exist for was always a step that assumed a side effect instead of verifying it.
- **A session's identity is the branch its log landed on**, not the current working directory or the primary checkout. Under a parallel session those differ. Skills target that branch explicitly and refuse to guess: more than one finalize candidate with no explicit target is an abort-or-ask, never an auto-pick.
- **Divergence is prevented by never merging locally**, independent of the remote merge strategy. The local integration branch only ever fast-forwards from the remote integration ref after the remote merge. The merge-strategy choice (`merge_strategy`) is about branch-deletion safety (`git branch -d` self-verifies after a merge commit), not the divergence guarantee.
- **The authoritative merge signal is the remote PR state** (`gh pr view <n> --json state` is `MERGED`), not a local command's exit code. `gh pr merge --delete-branch`'s local cleanup is best-effort and can abort while the remote merge has landed; reconcile locally, never treat that as a failed merge or retry the merge.

## GitHub CLI

This applies everywhere, not only inside the lifecycle skills.

- **Editing an existing PR's title or body uses the REST API, never `gh pr edit`.** `gh pr edit` issues a GraphQL `projectCards` query that errors under the GitHub Projects-classic sunset, and the whole edit aborts with nothing changed. Use REST:
  ```bash
  gh api repos/{owner}/{repo}/pulls/<n> -X PATCH \
    -f title="prefix(topic): ..." -F body=@<tmpfile>
  ```
  `gh api` fills `{owner}`/`{repo}` from the current repo. `-f` sends a string field; `-F field=@file` reads the value from a file, sidestepping multi-line shell quoting. Setting title and body at creation time via `gh pr create` is fine; only edits of an already-open PR hit the broken path.
