# Graph test cases

Manual test procedures for `/graph`. No automated runner is wired up,
so these are DevTools-driven. Update or add a case when you ship a
behavior worth re-verifying.

---

## 2026-05-21 — localStorage self-heal on schema drift

**Under test.** The `useMemo` in
`src/components/graph/ClaimGraphRF.tsx` (`ClaimGraphRFInner`,
around line 97). When `mode === "fullbleed"` and the persisted
snapshot rehydrates without any `domainGroup` node, the cache is
dropped and the graph rebuilds from `data/`.

### TC-1. Happy path — fullbleed persists and rehydrates intact

1. `npm run dev`. Open `http://localhost:3000/graph`.
2. Drag a claim a few pixels; collapse one domain group.
3. DevTools → Application → Local Storage → `http://localhost:3000`.
   Confirm `aboard.graph.v3` contains entries with
   `"kind":"domainGroup"`.
4. Hard-reload the page.

**Expected.** Graph renders with the moved claim in its new position
and the collapsed group still collapsed. No flash of a default
layout. No console errors.

### TC-2. Self-heal — fullbleed snapshot missing all domainGroup nodes

1. With a healthy persisted snapshot from TC-1, open DevTools →
   Application → Local Storage.
2. Edit `aboard.graph.v3`: filter out every entry where
   `kind === "domainGroup"` (or paste a JSON with only `kind:"claim"`
   entries in `nodes`). Keep `edges` intact.
3. Reload.

**Expected.**
- Graph renders correctly (all domain groups visible, claims inside
  them, the bug from session 9 does NOT recur).
- After one user interaction (e.g. drag any claim) the persisted
  snapshot in localStorage is rewritten and now contains
  `domainGroup` entries again.

**Negative.** If the graph renders inert (no domain headers, no
interactive collapse), the self-heal check did not fire — investigate
`isGroupNode` import and the `mode === "fullbleed"` branch.

### TC-3. Inline mode is NOT self-healed

1. With `aboard.graph.v3` stripped of `domainGroup` entries (from
   TC-2), navigate to `/` (the landing page hosts the inline graph).
2. Observe.

**Expected.** The inline graph renders from the stripped persisted
snapshot — no rebuild, no `clearPersisted()` call. Inline mode does
not produce `domainGroup` nodes, so the absence is not drift.

**Why this matters.** A future refactor that broadens the check to
both modes would silently nuke the user's inline-graph local edits on
every page load.

### TC-4. Malformed JSON falls through gracefully

1. In DevTools, set `aboard.graph.v3` to `{}` (or any string that
   doesn't parse to a valid `Persisted`).
2. Reload.

**Expected.** `loadPersisted()` returns `null`, the self-heal branch
isn't reached, and `engineToRF` runs as the fallback. Graph renders
correctly. No console error.

### TC-5. Empty fullbleed snapshot triggers a rebuild

1. Set `aboard.graph.v3` to `{"nodes":[], "edges":[]}`.
2. Reload.

**Expected.** Self-heal triggers (`nodes.some(isGroupNode)` is
false), `clearPersisted()` runs, graph rebuilds from `data/`. The
re-written snapshot afterward has the full set of `domainGroup`
nodes.

### Out of scope for these cases

- Mid-session schema-drift detection (we only check at hydration
  time). If a future change mutates the persisted shape during a live
  session, the user must reload to trigger the check.
- Collapsed-group restoration across `reset` — no longer applicable.
  As of session 11, `reset` returns the graph fully expanded and the
  separate collapsed-id store (`applyCollapsedState` /
  `aboard.graph.collapsedGroups.v1`) was removed. Collapse state now
  lives only in the persisted graph (`aboard.graph.v3`) and is restored
  by normal hydration; `reset` (which clears that key) discards it.
