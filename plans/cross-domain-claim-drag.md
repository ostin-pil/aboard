# Plan: drag a claim between domain groups

Let an author drag a single claim out of one domain group and drop it
into another, reassigning its parent group **and** its `data.domain`,
behind a confirm step.

## Context

Claims are pinned to their domain group by `extent: "parent"`, set in
`engine-to-rf.ts` (~lines 116–118) and reconstructed on hydration in
`persist.ts` (~lines 210–212). `extent: "parent"` clamps a child's drag
to its parent's bounds — so today a claim physically cannot leave its
domain. The only way to change a claim's domain in the editor is the
bulk-group action (`bulkGroupInto`), which is multi-select-oriented and
not a direct "drag this one elsewhere" gesture.

Changing a claim's domain is a **semantic** act (it re-files the claim
under a different problem area, alters cross-domain edge meaning, and
changes where the PR pack writes it), not just a layout move — so it
needs a confirm, not a silent reparent.

This is deferred UX item 4 from the session-9 review. Larger than
`domain-on-create.md`; its own PR.

## Goal

By end of session: dragging a claim node over a different domain group
and dropping it prompts "Move <id> to <domain>?"; on confirm the claim
joins the target group, its `data.domain` updates, both groups resize,
and the change persists.

## What already exists (reuse)

- **Drop-target detection**: React Flow v12 exposes
  `getIntersectingNodes(node, partially?, nodes?)` on the instance from
  `useReactFlow()` (`ClaimGraphRF.tsx` already calls `useReactFlow()` as
  `rf`). Not yet used anywhere in aboard.
- **Reparent mechanics**: `bulkGroupInto` (`ClaimGraphRF.tsx` ~620–650)
  is the reference implementation — it assigns `parentId` +
  `extent: "parent"`, sets `data.domain`, creates a group if the domain
  is new, computes local-coordinate slots, and calls
  `recomputeGroupBounds` (`engine-to-rf.ts` ~189–223). Cross-domain drag
  is essentially "bulkGroupInto for the one dragged node, target chosen
  by drop location instead of a menu."
- **Coordinate conversion**: `@xyflow/system` exports
  `evaluateAbsolutePosition` (child→absolute) and
  `clampPositionToParent` (absolute→parent-clamped). Alternatively
  reverse the parent offset directly as `bulkGroupInto` does.
- **Persistence**: `persist.ts` already round-trips `parentId`,
  position, and `data.domain` — **no schema/persist change needed**.
- **Drag lifecycle**: `onNodeDragStop` (`ClaimGraphRF.tsx` ~405–409) is
  the natural hook; there is currently no `onNodeDrag` mid-drag handler.

## The `extent: "parent"` constraint — design fork

`extent: "parent"` blocks the gesture entirely (you can't drag the node
past the group edge), so it must be addressed.

- **Option A (recommended): drop `extent: "parent"` on claims, clamp
  manually.** Claims become freely draggable. On `onNodeDragStop`, if the
  node is inside its current group, clamp it back into the group's local
  bounds (mirrors what `extent` did); if it's over another group, run the
  reparent flow. Cost: we own the clamp logic instead of RF, but it's the
  only option that allows the cross-group gesture.
- **Option B: lift `extent` only during a cross-group drag.** Keep
  `extent` normally; detect drag-start near the edge and temporarily
  remove it. Fiddly and stateful; not recommended.

Recommend Option A.

## Steps

1. **Free the claims.** Stop setting `extent: "parent"` on claims (or set
   it conditionally). Keep `parentId` so they still move with their group
   and persist correctly. Update both `engine-to-rf.ts` and `persist.ts`.
2. **Detect the drop target.** In `onNodeDragStop` (extend it to receive
   the dragged node), call `rf.getIntersectingNodes(node)` and filter for
   a `domainGroup` whose id ≠ the node's current `parentId`.
3. **Confirm.** If a different group is hit, show a confirm — reuse the
   existing modal/confirm idiom (e.g. the `reset` flow's `confirm()` in
   `GraphFullbleed.tsx`, or a small dedicated dialog). Message:
   `Move <id> to <targetDomain>?`
4. **Reparent on confirm.** Reuse `bulkGroupInto`'s body for a single
   node: set `parentId` = target group, `data.domain` = target domain,
   convert drop position to the target's local coords (clamp into
   bounds), then `recomputeGroupBounds` for both the old and new groups.
   Snapshot + persist (`snapshot()` / `persist()` as the other mutations
   do).
5. **Cancel path.** On cancel (or a drop not over another group), clamp
   the node back inside its current group and persist position only.
6. **Cross-domain edges.** A claim that moves domains may turn an
   intra-domain edge into a cross-domain one (or vice-versa). Decide
   whether to recompute the `crossDomain` flag on its incident edges at
   reparent time (the flag is `e.data.crossDomain`, set at seed time).
   Recommend recomputing it so the visual stays honest.

## Verification

1. `npm run dev`; `/graph` with both domains visible.
2. Drag a claim from `democratic_backsliding` over the `inequality`
   group → confirm prompt appears with the right id + target domain.
3. Confirm → claim now sits inside `inequality`, both groups resize, the
   domain filter treats it as `inequality`.
4. Cancel → claim snaps back into its original group, no domain change.
5. Reload → reparent persists (parentId + domain).
6. Any edge touching the moved claim shows the correct cross-domain
   styling.
7. Export PR pack → the moved claim writes under `data/inequality/`.
8. `npx tsc --noEmit` + `npm run build` clean.

## Risks and unknowns

- **Dropping `extent` may let claims drift outside any group** if the
  manual clamp has gaps — test the in-group clamp carefully.
- **Order invariant**: React Flow needs parents before children in the
  nodes array (`types.ts` note via `orderParentsFirst`). Reparenting
  must preserve that ordering on the next render/persist.
- **Coordinate math across groups of different sizes** — the drop
  position must convert from absolute to the *target* group's local
  space, not the source's.
- **Undo**: ensure the reparent is a single history snapshot so one undo
  reverts the whole move (domain + parent + position).

## Out of scope

- Multi-select cross-domain drag (bulkGroupInto already covers
  menu-driven multi-move).
- Creating a domain by dragging into empty space (only drops onto an
  existing group reparent).
- Rewriting cross-domain edge *rationales* after a move (the flag may
  flip; the human-authored rationale is left to the author).

## Effort

~half-day. Decision-heavy: yes — `extent` strategy (recommended A),
confirm UX, cross-group coordinate math, and the cross-domain-edge-flag
recompute.
