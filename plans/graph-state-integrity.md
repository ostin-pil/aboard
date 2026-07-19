# Plan: graph-state integrity — batch 2 of the code-quality audit

Fix the persisted-state cluster: E1 to E4 from `code-quality-audit.md` plus the
route error boundary from its section D. These are one PR because they share
one file pair (`ClaimGraphRF.tsx`, `persist.ts`) and one browser-QA pass, and
because three of them compound each other: E1 puts the editor sandbox on the
landing page, E2 turns a corrupt sandbox into a persistent white screen, and
via E1 that white screen reaches the landing page too.

This is also the second half of a known issue. `knowledge/issues.md`
(2026-05-20, "localStorage staleness silently breaks the graph") ranked four
mitigations; option 1 landed in session 10 and is the `schemaOk` check in
`ClaimGraphRFInner` today. Option 2 (an explicit version key) is E3, and its
recorded objection, that it "relies on devs remembering to bump", is what
§3 below is designed to remove. Close out that entry as part of this work.

Effort: roughly half a day, most of it QA. Prereq: none (batch 1 merged).

## 1. E1 — the landing page must never show the editor sandbox (HIGH)

`ClaimGraphRF.tsx:102-118` calls `loadPersisted()` unconditionally, and the
self-heal guard exempts inline mode from all validation:

```ts
const schemaOk = mode !== "fullbleed" || hydrated.nodes.some(isGroupNode);
```

For `mode === "inline"` the left side is always true, so any persisted state is
returned verbatim. The landing page (`page.tsx:91`) passes
`mode="inline"` with `engineData` scoped to one domain, so a visitor who has
ever edited on `/graph` sees their scratch state there instead: all domains,
fullbleed coordinates, deleted seed claims, collapsed groups. The header
counts alongside it are still computed from `engineData`, so the page
contradicts itself.

Fix: do not read persisted state in inline mode at all.

```ts
const initial = useMemo(() => {
  if (mode === "inline") return engineToRF(data, mode);
  // ... existing persisted path, fullbleed only
}, [data, mode]);
```

Preferred over per-mode storage keys: the inline graph is a read-only display
of canonical data and has no edit affordances, so it has nothing worth
persisting. Keying it separately would invent a second sandbox nobody asked
for. Confirm before implementing that no inline surface mutates the graph
(`editable` is false on the landing page); if one does, fall back to per-mode
keys instead.

## 2. E2 — validate persisted state, and self-heal instead of crashing (MED)

`persist.ts:49-53` accepts anything structurally truthy:

```ts
if (!parsed?.nodes || !parsed?.edges) return null;
const first = parsed.nodes[0];
if (first && (!first.position || !first.data || !first.kind)) return null;
```

`edges` is never shape-checked, so `{"nodes":[],"edges":{}}` passes; only
`nodes[0]` is inspected, so a malformed element at any other index passes.
`hydrateFromPersisted` then runs `p.edges.map(...)` (`persist.ts:149`) inside
the render-phase `useMemo`, so the throw happens during render, before the
`clearPersisted()` on the drift path can ever run. The result white-screens
`/graph` and, through E1, the landing page, and it recurs on every reload until
the key is deleted by hand.

Two changes:

- **Validate with Zod**, per CLAUDE.md's "if a type is unclear, model it
  explicitly with Zod". Model `Persisted` as a schema in `persist.ts` and
  `safeParse` it in `loadPersisted`; on failure clear the key and return null.
  The hand-rolled truthiness checks then go away entirely.
- **Wrap the hydrate call** in `try/catch` regardless, so a future shape bug
  degrades to "rebuild from `data/`" rather than a crash. Validation and the
  catch are belt and braces on purpose: the first is the contract, the second
  is what keeps a render-phase throw from being unrecoverable.

## 3. E3 — stamp the payload so new content reaches returning visitors (MED)

`persist.ts:10` invalidates only when a human edits `STORE_KEY`
(`aboard.graph.v3`), and the payload carries no version or content marker. A
visitor who has ever touched `/graph` keeps their snapshot indefinitely, so
every claim, edge, or domain merged into `data/` afterwards is invisible to
them. For a board whose content is the product, that silently caps the value of
corpus growth, and it is exactly the failure `issues.md` option 2 describes.

Stamp two fields into the persisted payload and check both on load:

- `schemaVersion`: a constant in `persist.ts`, bumped on breaking shape
  changes. This is option 2 as recorded.
- `seedHash`: a cheap stable hash of the `engineToRF(data, mode)` output (ids
  plus kinds is enough; it must not include positions, which the user is
  entitled to move). This is what answers the recorded objection to option 2:
  content drift is detected without anyone remembering to bump anything.

On `schemaVersion` mismatch, drop the snapshot (silent is fine: the shape is
unusable). On `seedHash` mismatch the local edits are still valid, so do not
drop them silently. Surface `issues.md` option 3 instead: a one-line notice in
the meta strip, "new claims have been published since your last visit; reset
to rebuild", next to the existing `reset`. That reuses the `reset()` path
already at `ClaimGraphRF.tsx:371`.

## 4. E4 — re-measure groups after undo and redo (MED)

`undo` and `redo` (`ClaimGraphRF.tsx:347-366`) restore group `style.width` and
`style.height` through `setNodes` without calling `updateNodeInternals`. The
collapse path 25 lines earlier does exactly that, with a comment explaining why
(`:322-330`): React Flow does not re-measure on its own, so cached `measured`
dims go stale and the collapsed pill becomes undraggable. Undoing a collapse
therefore reintroduces the bug `knowledge/issues.md` already records.
`updateNodeInternals` is even in `buildInstance`'s dependency array
(`:390`) while being unused in its body, which is the tell.

Fix: after the `setNodes`/`setEdges` pair in both handlers, re-measure in a
`requestAnimationFrame` every group whose `style` differs between the outgoing
and incoming snapshots (or simply every group node, since there are few and the
call is idempotent). Fold it into the existing `requestAnimationFrame(persist)`
rather than adding a second frame.

## 5. Route error boundary (section D)

Add `src/app/graph/error.tsx`. Upgraded from nice-to-have by E2: without it a
render-phase throw takes out the whole route with the default Next error
screen and no way back. The boundary should offer one action that calls
`clearPersisted()` and reloads, which is the documented escape hatch
(`issues.md` option 4) and the only recovery a non-technical visitor has.

Note it must be a client component, and that an error boundary catches render
throws but not the initial module-eval error, so it complements §2's
validation rather than replacing it.

## Decisions

- **Inline mode reads no persisted state at all** versus per-mode keys:
  recommend the former (§1), with the fallback stated there.
- **`seedHash` over ids and kinds only.** Including positions would fire on
  every layout nudge; including full claim bodies would make the hash churn on
  a typo fix. Ids plus kinds catches "content was added or removed", which is
  the case that matters.
- **Notify rather than nuke on content drift** (§3) but **drop silently on
  schema drift.** Local edits survive the first and cannot survive the second.
- **Zod plus try/catch, not one or the other** (§2).

## Verification

Browser QA is the gate here; the unit tests cover the parts that can be
covered.

1. **E1 repro, before and after.** On `/graph`, delete a seed claim and add a
   node; return to `/`. Before: the landing graph shows the edit. After: it
   shows the canonical board, and the node count matches the header.
2. **E2 fixtures as unit tests.** Feed `loadPersisted`/`hydrateFromPersisted`
   a corrupt payload set (`edges: {}`, `nodes: [null]`, a malformed element
   at index 3, valid JSON of the wrong shape, non-JSON) and assert each
   returns null (or a rebuilt graph) and never throws. These are the
   "persisted-state tests" from the audit's section C.
3. **E3.** With a snapshot saved, bump `schemaVersion` and reload: snapshot
   dropped, graph rebuilt. Separately, add a claim to `data/`, rebuild, and
   reload with an existing snapshot: edits kept, notice shown, `reset`
   rebuilds.
4. **E4.** Collapse a group, undo, and drag the group: it drags. Redo, drag
   the pill: it drags. This is a manual check; React Flow's measurement is not
   observable from vitest.
5. **Boundary.** Write a deliberately corrupt value to `aboard.graph.v3` by
   hand, load `/graph`: the boundary renders with a working recovery action
   rather than a white screen. Then confirm §2 means this path is not reached
   in the first place.
6. `npx tsc --noEmit`, `npm test`, `npm run build`, `npm run lint` all clean.

## Out of scope

- Splitting `ClaimGraphRF.tsx` (audit section D, batch 6). This batch touches
  the same file and will conflict textually; do the split afterwards, not as
  part of this.
- The hover and connection-drag perf work (also section D): same file, but a
  separate concern with its own QA.
- E5 to E9 (shortcut gating, modal a11y, collapsed-group insert, client id
  prefixes, the LOW grab-bag). E5 and E9 are cheap and adjacent; fold them in
  only if the diff is still small when the four above are done.

## Follow-up

Close the `knowledge/issues.md` entry of 2026-05-20 in the same PR: record that
option 2 landed with a content hash that removes its stated fragility, that
option 3 landed as the drift notice, and that option 4 landed as the error
boundary's recovery action.
