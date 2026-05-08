---
name: verify
description: Verify the current build state and check what's implemented
allowed-tools: Bash Read Grep Glob
---

Check the current state of the aboard project:

1. Type-check: `npx tsc --noEmit 2>&1 | tail -20`
2. Lint: `npm run lint 2>&1 | tail -20`
3. List all source files under `src/` and their line counts
4. Note presence of key surfaces (graph view, claim detail, dossier, JSON-LD endpoints, agent forecast generation script)
5. If on a feature branch, note the branch name and what it targets
6. Report: what's done, what's next, any type or lint issues
