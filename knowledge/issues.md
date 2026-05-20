# issues

Long-lived notes on bugs, gotchas, and decisions that aren't obvious
from the code or session logs. Each entry is dated; "Status:" line at
the end of the entry tracks whether it's still relevant.

---

## 2026-05-20 — React Flow: `onNodeClick={noop}` is load-bearing for inner buttons

**Symptom.** Inner interactive elements inside a custom node (e.g. the
chevron button on `DomainGroupNode`) silently fail to receive their own
`onClick`. The button doesn't fire, no pointerdown reaches it, and
click-and-drag on the same element pans the canvas instead.

**Cause.** `@xyflow/react` v12 only wires up React's click event for
nodes when an `onNodeClick` prop is present on the `<ReactFlow>`
component. Without it, the inner button's onClick is swallowed even
when the button has the documented `nodrag nopan` classes.

**Fix.** A no-op `onNodeClick={() => {}}` on `<ReactFlow>` is enough.
See `src/components/graph/ClaimGraphRF.tsx` (load-bearing comment lives
above the prop). Removing it re-introduces the regression — bisected
2026-05-20 from a multi-probe debug session.

**How we found it.** Three probes were added during debugging (button
`onPointerDown`, RF `onNodeClick`, RF `onPaneClick`). All three were
removed when the bug "magically" fixed itself. Buttons broke again
after the cleanup commit; bisecting the probes one at a time
identified `onNodeClick` alone as the load-bearing change.

**How to detect this class of regression early.** When click handlers
inside an RF custom node stop firing, suspect `onNodeClick` first.
The cheapest discriminating check is to add a no-op `onNodeClick` on
the parent `<ReactFlow>` and see if the inner handler now fires.

Status: workaround landed (`10ad5b6`). Upstream behavior; revisit on
next @xyflow/react major.

---

## 2026-05-20 — localStorage staleness silently breaks the graph

**Symptom.** Headers, buttons, or whole node types render as
inert / invisible / unstyled. New code paths don't seem to apply even
after restart, build, or hard reload.

**Cause.** `aboard.graph.v3` and `aboard.graph.collapsedGroups.v1` in
the browser's localStorage hold whatever shape the graph had the last
time the user touched it. When the in-code schema evolves (e.g.
`domainGroup` nodes were added), the persisted snapshot is from before
that evolution and rehydrates into a graph that doesn't match what
`engineToRF` would now produce. The new node types literally never
mount because they aren't in the persisted nodes array.

**Concrete repro from this session.** Clearing both keys fixed a
non-interactive `/graph` page where the domain headers visually
existed (rendered from `engineToRF` on first hit) but the
collapse/expand pipeline routed through stale persisted nodes that
didn't know about the new types.

**Other co-resident keys you may see in DevTools.**
- `clerk_telemetry_throttler` — written by the Clerk SDK on any
  localhost site that loads it. Not from aboard. Safe to delete.

**Mitigation strategies (ranked).**

1. **Self-healing hydration on schema drift (recommended).** In
   `ClaimGraphRFInner` (`src/components/graph/ClaimGraphRF.tsx`),
   after `hydrateFromPersisted`, sanity-check that the persisted
   shape contains the structural features the current `engineToRF`
   would produce. For example: in `fullbleed` mode there must be at
   least one `domainGroup` node. If not, clear the cache and rebuild
   from `data/`. Sketch:

   ```ts
   const initial = useMemo(() => {
     const persisted = loadPersisted();
     if (persisted) {
       const hydrated = hydrateFromPersisted(persisted);
       const schemaOk =
         mode !== "fullbleed" || hydrated.nodes.some(isGroupNode);
       if (schemaOk) return hydrated;
       clearPersisted();
     }
     return engineToRF(data, mode);
   }, [data, mode]);
   ```

   Cost: a few lines. Loses only the user's local edits in cases
   where they'd be unrecoverable anyway.

2. **Explicit schema version key, checked on load.** Add a
   `STORE_SCHEMA_VERSION` constant in `persist.ts`; bump it whenever
   any breaking shape change lands. Compare to a `version` field in
   the stored payload on load; on mismatch, drop. Fragile because it
   relies on devs remembering to bump on every refactor.

3. **Visible reset hint when the graph looks structurally wrong.**
   If we detect schema drift at runtime (option 1), show a one-line
   "your local sandbox is out of date — `reset` to rebuild" message
   in the meta strip instead of silently nuking. Lets the user
   decide. More UX work; consider if option 1 turns out to lose
   real local edits in practice.

4. **A keyboard shortcut for "nuke local state."** Currently the
   user has to find the existing `reset` toolbar button or open
   DevTools and delete keys. A documented shortcut (e.g. `⌘⇧R` on
   `/graph`) that calls `clearPersisted()` + `window.location.reload()`
   would be a cheap escape hatch.

Status: option 1 landed
(`feature/session-10-localstorage-selfheal`). The `useMemo` in
`ClaimGraphRFInner` now sanity-checks that fullbleed-mode rehydrations
contain at least one `domainGroup` node; otherwise it calls
`clearPersisted()` and rebuilds from `data/`. Options 3 and 4 remain
open if option 1 turns out to lose real local edits in practice.

---

## 2026-05-20 — Turbopack CSS HMR can miss `globals.css` edits

**Symptom.** A CSS rule edit lands in `src/app/globals.css`, the dev
server logs no errors, hot-reload happens — but the new rule never
appears in the browser's computed styles. Confirmed by inspecting the
element: the property simply isn't in the rule list.

**Workaround.** Kill the `next dev` process, `rm -rf .next`, restart.
Hard reload (Cmd+Shift+R) to clear the CSS chunk cache.

**Detection trick.** In DevTools, pick an element you know your new
rule should match and check Computed Styles. If the rule appears there,
the CSS reached the browser. If not, you're on stale CSS — restart.

Status: appears intermittent on Next.js 16.2.6 + Turbopack. Hasn't
reproduced often enough to file upstream; track if it gets worse.

---

## 2026-05-20 — Recurring `packageManager` field added to `package.json`

**Symptom.** `git diff package.json` periodically shows a new
`"packageManager": "yarn@..."` field on lines we didn't edit.

**Cause.** Corepack (the Node tooling shim) injects this when it
detects an indeterminate package manager. Noise, not a real change.

**Workaround.** Don't stage it; `git checkout -- package.json` after
non-package-manager edits, or use `git add` with specific files.

Status: deferred cleanup carried from session 8.
