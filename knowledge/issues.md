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

**Cause.** `aboard.graph.v3` in the browser's localStorage holds
whatever shape the graph had the last time the user touched it. When the
in-code schema evolves (e.g. `domainGroup` nodes were added), the
persisted snapshot is from before that evolution and rehydrates into a
graph that doesn't match what `engineToRF` would now produce. The new
node types literally never mount because they aren't in the persisted
nodes array. (Note: as of session 11 collapse state lives only in
`aboard.graph.v3`; the separate `aboard.graph.collapsedGroups.v1` key was
removed when `reset` was changed to expand all groups.)

**Concrete repro from this session.** Clearing the key fixed a
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

Status: RESOLVED (`fix/graph-state-integrity`, batch 2 of the code-quality
audit). All four mitigations now exist, and the code-quality re-audit found
that option 1 alone was insufficient — the self-heal guard read `mode !==
"fullbleed" || ...`, so inline mode was exempt from it entirely, which put the
editor sandbox on the landing page (audit E1).

- Option 1 (self-heal on schema drift) landed in session 10 and stays, now
  fullbleed-only and with the inline exemption removed.
- Option 2 (explicit version key) landed as `STORE_SCHEMA_VERSION` in
  `persist.ts`. Its recorded fragility ("relies on devs remembering to bump")
  is answered by pairing it with a content `seedHash` over the canonical
  claims' `id:kind`, which detects data/ drift without a manual bump.
- Option 3 (visible reset hint on drift) landed as the meta-strip "new claims
  published since your last visit · reset to rebuild" notice, shown on
  seedHash mismatch so local edits are kept rather than nuked.
- Option 4 (recovery escape hatch) landed as `src/app/graph/error.tsx`, whose
  primary action clears the sandbox and retries.

Also fixed alongside: the persisted payload is now Zod-validated (a corrupt
one previously threw in the render-phase hydrate and white-screened the
route), and the graph renders client-only so a localStorage-derived tree no
longer hydration-mismatches the server prerender.

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

## 2026-05-20 — Lightning CSS `z-index` warnings during build are cosmetic

**Symptom.** `npm run build` prints `` `z-index` is currently not
supported. `` repeatedly (once per `z-index` declaration).

**Cause.** Tailwind v4's Lightning CSS minifier emits this for each
`z-index` it can't fully analyze at minification time. There are 13
`z-index` declarations in `src/app/globals.css` (the only
build-relevant stylesheet — the `Claude Design Screens/` assets are
standalone mockups, not in the Next build).

**Impact.** None functional. The declarations are **not dropped**; the
stacking order renders correctly. Purely an optimization-time notice.

**Suppression.** None available. Lightning CSS exposes no comment
directive or per-property opt-out, and there is no `next.config.ts` /
PostCSS knob for it on Next.js 16.2.6 + Tailwind v4. Investigated
session 10 — concluded not cleanly fixable in code, so we deliberately
do **not** churn the CSS to chase it.

Status: accepted as benign. Revisit only if a future Lightning CSS
release adds a knob, or if a `z-index` is ever actually dropped from
the output.

---

## 2026-05-20 — Recurring `packageManager` field added to `package.json`

**Symptom.** `git diff package.json` periodically shows a new
`"packageManager": "yarn@..."` field on lines we didn't edit.

**Cause.** Corepack (the Node tooling shim) injects this when it
detects an indeterminate package manager. Noise, not a real change.

**Why `yarn`?** Spurious — the project is npm-based (CLAUDE.md
`npm install` / `npm run dev`, every session). The injected value was
wrong, not just noisy.

**Resolution (2026-05-20, session 10).** Pinned the correct manager
instead of fighting the churn: `"packageManager": "npm@10.9.2"` is now
committed in `package.json`. Corepack stops rewriting the field once a
valid value is present, so the recurring diff is gone. If npm is
upgraded, bump this value to the new `npm --version` in the same commit.

---

## 2026-07-13 — A build without `SITE_URL` emits JSON-LD that fails our own schema

**Symptom.** `clients/validate.ts` rejects `/api/graph` and
`/api/claims/<id>` from a default `npm run build`, with dozens of
`@id — must match format "uri"` errors and a final
`(root) — must match exactly one schema in oneOf`.

**Cause.** Two rules disagree. `public/schema/v0.json` is the
authoritative spec and requires `"format": "uri"` on every `@id`, which
means an **absolute** IRI. But `src/lib/site.ts` returns `""` when the
`SITE_URL` env var is unset, and `jsonld.ts` then emits **relative**
IRIs (`/claims/L1` rather than `https://…/claims/L1`). Relative IRIs are
legal JSON-LD — they resolve against the document base — but they are not
legal against our own schema. The static-export migration (session 14)
introduced the fallback; nothing reconciled it with the schema.

**The deployed site is NOT affected — verified.**
`https://aboard.ostin-pil.workers.dev/api/graph` emits absolute `@id`s and
validates clean. `SITE_URL` is set **in the Cloudflare dashboard**, not in
`wrangler.jsonc` and not anywhere in this repo — so nothing you can grep
for tells you it exists. Do not "fix" a live-site breakage that isn't
there; check the deployed endpoint first. Only a local or CI build with
no `SITE_URL` produces the bad output.

**Workaround in place (session 15).** CI builds with
`SITE_URL=http://localhost:3000`, so it validates the artifact the way a
real deploy builds it, and the contract is genuinely checked. A local
`npm run build` with no `SITE_URL` still produces output that would fail
validation.

**The real fix was a decision, not code.** It needed the canonical domain,
which also blocked `plans/repo-hardening.md` §4 (the vocab namespace was
still the placeholder `https://aboard.example/vocab/`). One decision, two
unblocks.

**Resolution (2026-07-14, session 17).** The canonical domain is
`aboard.untype.me`. `siteBaseUrl()` now **defaults** to
`https://aboard.untype.me` instead of `""`, with `SITE_URL` still
overriding it for preview deploys and localhost builds. A default
`npm run build` therefore emits absolute `@id`s and validates clean
against `public/schema/v0.json`. CI's `SITE_URL=http://localhost:3000`
crutch was removed in the same commit, precisely so CI exercises the
default path a contributor actually gets — setting the env var there
would hide a regression in the thing that was broken.

The schema was *not* relaxed to `uri-reference`. Absolute `@id`s are the
right contract for a graph whose whole premise is that agents can
dereference it.

**Follow-up (2026-07-16, session 19) — the `@id`s now point at a DEAD host.**
Wiring `aboard.untype.me` as the Worker's custom domain (PR #32) had a side
effect: adding `routes` to `wrangler.jsonc` disabled the `workers.dev`
subdomain (Cloudflare does this unless you also set `workers_dev: true`). So
`aboard.ostin-pil.workers.dev` now 404s, and the site serves on
`aboard.untype.me`. But the `SITE_URL` **build variable** in the Cloudflare
dashboard is still pinned to the old `workers.dev` URL, so it overrides the new
default and the published `@id`s read `https://aboard.ostin-pil.workers.dev/...`
— absolute (so still schema-valid) but pointing at a host that no longer
resolves. **Resolved (2026-07-17):** the `SITE_URL` build variable was deleted
from the Cloudflare dashboard, and the next deploy picked up the code default —
the live graph now emits `https://aboard.untype.me/...` `@id`s and validates
clean. (Optional, not done: set `workers_dev: true` in `wrangler.jsonc` to bring
the old workers.dev URL back as a fallback; nothing depends on it.)

Status: resolved.

---

## 2026-07-13 — `npm run lint` has 5 pre-existing errors, so CI cannot gate on it

**Symptom.** `npm run lint` exits non-zero: 5 errors, 12 warnings.

**Cause.** React Compiler / `react-hooks` rules, all pre-existing:
- `src/components/graph/ClaimGraphRF.tsx` — "Cannot access refs during
  render" (×3, around the history/undo refs), plus "Existing memoization
  could not be preserved".
- `src/components/ThemeToggle.tsx` — "Calling setState synchronously
  within an effect can trigger cascading renders".

These are genuine refactors in interactive graph code, not cosmetic
nits, and fixing them needs browser verification of the graph's
undo/redo and drag behaviour — not something to bundle blind into an
unrelated commit.

**Workaround in place (session 15).** The CI `Lint` step runs with
`continue-on-error: true`. It reports without blocking.

**Resolved (session 22).** The three `refs` errors were fixed properly: the
latest-value `nodesRef`/`edgesRef` writes moved into an effect, and the
new-node modal's position now comes from a `getDefaultPosition()` callback
read at save time rather than a layout read during render. The
`preserve-manual-memoization` and `set-state-in-effect` errors — React
Compiler-preview rules, and the compiler is not enabled here — are suppressed
at the site with a justification. `npm run lint` is now 0 errors (15 warnings,
which do not fail eslint), and the CI `Lint` step is a hard gate with no
`continue-on-error`.

Status: resolved.

**Rejected alternative.** A parallel branch
(`chore/session-10-corepack-autopin`, commit `ae36481`) set
`COREPACK_ENABLE_AUTO_PIN=0` in `.claude/settings.json`. That only
applies to shells Claude spawns — the user's own terminal, CI, and
other contributors aren't covered, and it doesn't declare the package
manager. The pin is corepack's intended mechanism and works
universally, so the autopin branch was abandoned (deleted; recover from
`ae36481` if ever needed). Don't re-add the env var — the pin covers it.

Status: resolved — `packageManager` pinned to npm.

---

## 2026-08-05 — the prose gate runs claude-plugins' working tree, whatever branch it is on

**Symptom.** `bin/check-prose.sh` produces different results over time with
no change to this repo, and results that a fresh clone of aboard on another
machine would not reproduce.

**Cause.** The resolver tries `prose-mint` on `PATH`, then
`~/Projects/prose-mint/bin/prose-mint`. On this machine the first branch
finds nothing, so the second is the live path rather than a fallback. And
`~/Projects/prose-mint` is a symlink to
`~/Projects/claude-plugins/prose-mint`, where `bin/prose-mint` is a launcher
that runs the package straight from the checkout with no install. So the
gate executes whatever claude-plugins currently has checked out, including
uncommitted edits and whatever feature branch is open there.

**Observed.** While claude-plugins sat on `feature/session-1-refetch` on
2026-08-05, a `bin/check-prose.sh` run here would have linted against that
branch's detectors. Nothing in aboard changed, and nothing in the output
says which code ran.

**Second-order.** The coupling currently runs in aboard's favour. The
prose-mint plugin published through the marketplace is eight commits behind
its source, and the tool it installs comes from PyPI via `uvx`, so a fresh
install would lint with older code than this checkout does. Pinning to the
published version would move the gate backwards until a release is cut.

**Not fixed.** Two coherent options, and the choice is a real one. Pin to a
released version (reproducible, currently older, needs a PyPI release to
catch up), or keep the symlink and accept that the gate tracks a working
tree (immediate iteration, not reproducible off this machine). Worth
deciding on purpose rather than by default.

**Dead link, found on the way, since fixed.** `.claude/rules/prose-style.md`
linked prose-mint to `github.com/ostin-pil/prose-mint`, which returns 404.
The code lives in `ostin-pil/claude-plugins` under `prose-mint/`, and the
link now points there. That was a separate edit from the pinning question
above, which is still open.

Status: open — behaviour understood, decision deferred.
