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

**Browser pass, 2026-07-20.** A manual repro on current `main` confirmed E1 and
E4 and surfaced two findings the static audit could not see (N1, N2 in §6).
E1 is bidirectional, not read-only, and E4 is worse than "undraggable pill":
the group wedges and the expand toggle stops responding, recoverable only by
`reset`. Both corrections are folded in below.

## 0. N1 first — the graph must render client-only (MED, new)

The single highest-leverage change, and the one the others sit on. There is no
mounted gate anywhere (`grep` for `ssr:`/`dynamic(`/`mounted` across the canvas
files is empty), so under `output: "export"` the graph is prerendered to static
HTML at build time. But its initial state is derived from `localStorage`
(`loadPersisted`), which is `undefined` on the server. So the server renders the
`engineToRF(data)` tree and the client renders the persisted tree, and any
visitor with a saved sandbox hydration-mismatches on every load, in production.
This was live in the browser pass: a React "tree hydrated but some
attributes … didn't match" error on `/`, plus a React-Flow-internal
`AriaLiveMessage` style mismatch (`width:"1px"` server vs `width:1` client)
that is present even without persisted state.

Fix: render `<ClaimGraphCanvas>` client-only via a `mounted` flag
(`useState(false)` set true in a `useEffect`) that returns a sized placeholder
until mounted, or `next/dynamic(..., { ssr: false })`. The surrounding page
(header, counts, prose) stays server-rendered, so no SEO is lost; the canvas
is an interactive SVG, not indexable content. This eliminates the mismatch on
both `/` and `/graph`, and it shrinks the blast radius of E1 and E2: there is no
longer an SSR'd localStorage tree to disagree with anything.

E1's own fix (§1) still stands: even client-side, inline must not read the
sandbox. N1 removes the hydration failure mode; §1 removes the wrong-content
failure mode. They are different bugs with the same smell.

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

**Bidirectional, not read-only.** The browser pass showed this is worse than a
stale read. `hydrateFromPersisted` reconstructs `domainGroup` nodes from the
snapshot, and the group header chevron (`toggleDomainCollapse`, which calls
`persist()`) is *not* gated on `editable`. Inline is normally safe only because
`engine-to-rf.ts:51` builds no groups in inline mode, so no chevron renders. But
once a fullbleed snapshot injects group nodes into the inline graph, chevrons
appear on the landing page and clicking one writes back to the shared key. The
pass also logged `[React Flow] Couldn't create edge for target handle "null",
edge IS1->M2#causes#24` on `/`, where `IS1` is an `inequality` claim that cannot
exist in the `democratic_backsliding` landing graph, so the sandbox's
cross-domain edges are being rendered against an inline layout that has no such
handles. Concrete proof of E1, and of why inline must not touch the store.

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

## 4. E4 — replay collapse side-effects on undo and redo (MED, elevated)

The audit framed this as "the collapsed pill becomes undraggable." The browser
pass found worse: a series of collapse/expand then undo/redo wedges the group so
the **expand toggle stops responding**, recoverable only by `reset`. Elevate the
observed severity accordingly.

`undo` and `redo` (`ClaimGraphRF.tsx:347-366`) restore nodes and edges through
`setNodes`/`setEdges` from a raw history snapshot. The live collapse path
(`toggleDomainCollapse`, `:225-330`) does three things beyond mutating state:
it recomputes group bounds on the expand branch (`recomputeGroupBounds`,
`:256`), and it re-measures and re-persists in a `requestAnimationFrame`
(`updateNodeInternals`, `:322-330`, with a comment explaining exactly why).
Undo and redo replay none of it. The snapshot itself is fine: `snapshot()`
(`:206-218`) carries `style` by reference, but the collapse path always builds a
*fresh* style object (`:238-244`), so the historical dims round-trip correctly.
The failure is the un-replayed post-processing: stale `measured` dims mean the
chevron's clickable region no longer matches where it renders, which is the
wedge. `updateNodeInternals` is even in `buildInstance`'s dependency array
(`:390`) while unused in its body, which is the tell.

Fix: after the `setNodes`/`setEdges` pair in both handlers, replay the same
post-processing the live toggle uses, `recomputeGroupBounds` for any group
whose restored `collapsed` flag is false and then `updateNodeInternals` for
every group node, inside the existing `requestAnimationFrame(persist)` rather
than a second frame. Re-measuring alone (the audit's one-liner) is likely
sufficient for the pill, but the observed wedge argues for replaying bounds
too; verify against the exact repro below before deciding the smaller fix is
enough.

## 5. N2 — harden `cleanHandle` against stringified null (LOW, new)

`persist.ts:7-8` drops transient `full-*` handles on load but passes any other
truthy string through, including the literal `"null"`:

```ts
const cleanHandle = (h?: string) => (h && !h.startsWith("full-") ? h : undefined);
```

The browser pass logged React Flow error #008 for a `target handle "null"`.
Fresh-built edges carry no handle (`engine-to-rf.ts:127-139` sets neither), so a
stringified `"null"`/`"undefined"` can only enter through the persisted
round-trip or a connection whose handle serialized as the string. One line:
also reject `"null"` and `"undefined"`. Mostly subsumed by E1 for the landing
page, but it hardens the fullbleed path too, and it is trivially unit-testable
alongside the E2 fixtures.

## 6. Route error boundary (section D)

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
covered. **Run the browser checks in an extension-free window** (incognito with
extensions disabled). The 2026-07-20 pass ran with Dark Reader active, which
injected `data-darkreader-inline-fill` attributes and produced its own hydration
noise; that is the extension mutating the DOM before React hydrates, not an
aboard bug, and it masks the real signal. React's own message lists this cause.

1. **N1 hydration.** In a clean window, load `/` and `/graph` with the console
   open, both with and without a saved sandbox. Before: a "tree hydrated but …
   didn't match" error (and a React-Flow `AriaLiveMessage` style diff even with
   no sandbox). After the client-only render: no hydration error from the graph
   subtree in either state.
2. **E1 repro, before and after.** On `/graph`, delete a seed claim and add a
   node; return to `/`. Before: the landing graph shows the edit, and the
   console logs `[React Flow] Couldn't create edge … handle "null"` for an
   `IS1->…` edge (an inequality claim on the backsliding landing page). After:
   `/` shows the canonical board, node count matches the header, no such log.
3. **E2 fixtures as unit tests.** Feed `loadPersisted`/`hydrateFromPersisted`
   a corrupt payload set (`edges: {}`, `nodes: [null]`, a malformed element
   at index 3, valid JSON of the wrong shape, non-JSON) and assert each
   returns null (or a rebuilt graph) and never throws. These are the
   "persisted-state tests" from the audit's section C.
4. **E3.** With a snapshot saved, bump `schemaVersion` and reload: snapshot
   dropped, graph rebuilt. Separately, add a claim to `data/`, rebuild, and
   reload with an existing snapshot: edits kept, notice shown, `reset`
   rebuilds.
5. **E4, the exact repro that failed.** On `/graph`, collapse a group, then
   run a short collapse/expand plus undo/redo sequence. Before: the group
   wedges: the expand chevron stops responding and only `reset` recovers.
   After: every collapse survives undo and redo, the group expands on click,
   and both the group and the collapsed pill drag tracking the cursor 1:1.
   Manual; React Flow's measurement is not observable from vitest.
6. **N2.** Unit-test `cleanHandle("null")` and `cleanHandle("undefined")`
   return undefined, alongside the E2 fixtures.
7. **Boundary.** Write a deliberately corrupt value to `aboard.graph.v3` by
   hand, load `/graph`: the boundary renders with a working recovery action
   rather than a white screen. Then confirm §2 means this path is not reached
   in the first place.
8. `npx tsc --noEmit`, `npm test`, `npm run build`, `npm run lint` all clean.

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
