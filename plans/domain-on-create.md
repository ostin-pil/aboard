# Plan: domain selector in the node-create modal

Let an author choose a domain (existing or new) when creating a claim in
the `/graph` editor, instead of every new claim being domainless.

## Context

`NodeEditorModal` (`src/components/graph/NodeEditorModal.tsx`) builds the
draft claim with `domain: undefined` hardcoded (~line 64) and renders no
UI to set it. So every claim created in the editor floats outside the
domain model: it carries no `data.domain`, never joins a
`__domain_<domain>` group in fullbleed mode, and exports without a
domain in the PR pack. The domain filter chips and cross-domain edges
all key off `data.domain`, so a domainless claim is effectively
invisible to that machinery.

This is deferred UX item 5 from the session-9 review.

## Goal

By end of session: creating a claim via the modal offers a domain
control — pick from existing domains or type a new one — and the saved
claim carries that `data.domain`. In fullbleed mode the new claim lands
in the matching domain group.

## What already exists (reuse, don't reinvent)

- **Domain-picker UI**: `src/components/graph/BulkActionsToolbar.tsx`
  (~lines 136–167) already implements exactly the control we want — a
  list of existing-domain buttons plus an inline `new domain…` input +
  `add` button, committing via a single `commitGroup(domain)` that trims
  and validates. Mirror this as a new `.ag-field` block in the modal, or
  extract it into a shared `DomainPicker` component used by both.
- **Available-domains list**: `ClaimGraphRF.tsx` (~lines 751–758)
  computes `availableDomains` from current nodes (group `data.domain` +
  claim `data.domain`) and already passes it to `BulkActionsToolbar`.
  Pass the same array into `NodeEditorModal`.
- **Group-creation + slotting path**: `bulkGroupInto` in
  `ClaimGraphRF.tsx` (~line 620–650) already knows how to assign a
  claim's `parentId`/`extent: "parent"`, set `data.domain`, create a
  group if the domain is new, and call `recomputeGroupBounds`
  (`engine-to-rf.ts` ~189–223). Reuse this logic for create-time
  slotting rather than writing new grouping code.
- **Round-trip**: `rfToEngine` (`engine-to-rf.ts` ~line 166) already
  serializes `data.domain` when truthy; `persist.ts` already saves it.
  No loader/schema/persist change needed.

## Steps

1. **Modal prop + state.** Add `availableDomains: string[]` to
   `NodeEditorModal`'s props; add a `domain` state (default: the editor's
   active domain if set, else empty). For an *edit* (existing node),
   seed it from `node.data.domain` so editing no longer silently drops
   the domain.
2. **Render the picker.** Add a `.ag-field` after the confidence field
   using the BulkActionsToolbar pattern (existing-domain list + new
   input). Keep it keyboard-accessible and styled with the existing
   `.ag-field` / `.ag-bulk-pop` tokens.
3. **Build the draft.** Change `domain: undefined` →
   `domain: domain.trim() || undefined` in the draft (~line 64).
4. **Pass the list down.** In `ClaimGraphRF.tsx`, pass `availableDomains`
   into `<NodeEditorModal>` (it's already memoized there).
5. **Slot into the group (the design fork — see below).**

## Design fork — slot on create, or leave free?

A claim appended by `onNodeSave` (`ClaimGraphRF.tsx` ~454–481) currently
gets **no** `parentId`/`extent`, so even with a domain set it would
render as a free-floating node in fullbleed mode, not inside the group.

- **Option A (recommended): slot on create.** After save, if
  `mode === "fullbleed"` and a domain is set, route the new claim through
  the same reparent logic `bulkGroupInto` uses: find-or-create the
  `__domain_<domain>` group, assign `parentId` + `extent: "parent"`,
  position into the group's local coords, and `recomputeGroupBounds`.
  Consistent with how seeded claims render. Brand-new domain → create the
  group first (the `bulkGroupInto` path already handles this).
- **Option B: leave free, group later.** Simpler (just set `data.domain`),
  but produces an orphan node visually until the user manually groups it.
  Inconsistent; not recommended.

Recommend Option A; it reuses `bulkGroupInto`'s machinery so there's
little new code.

## Verification

1. `npm run dev`; open `/graph`, click `+ new claim`.
2. Picker shows existing domains (`democratic_backsliding`, `inequality`)
   + a new-domain input.
3. Pick an existing domain → save → claim appears **inside** that
   domain's group (Option A).
4. Type a new domain → save → a new group is created with the claim in
   it; the domain filter chips now include it.
5. Reload (persist round-trip) → the claim keeps its domain and group.
6. Export PR pack → the new claim's Markdown frontmatter carries the
   domain / lands in `data/<domain>/`.
7. `npx tsc --noEmit` + `npm run build` clean.

## Out of scope

- Renaming or deleting domains.
- Moving an *existing* claim between domains — that's the separate
  `cross-domain-claim-drag.md` plan.
- Per-domain ID-prefix enforcement (claims get IDs from `newId`, which is
  kind-prefixed, not domain-prefixed; revisit if collisions appear).

## Effort

~1–2 hr. Decision-heavy: light — the one fork is slot-on-create
(recommended A) vs leave-free.
