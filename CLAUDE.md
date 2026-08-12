@AGENTS.md

# aboard

An agent-first board of falsifiable claims about systemic problems facing humanity. Three modules over a shared claim graph: predictions (time-boxed forecasts), problem trees (symptom → mechanism → leverage point), and adversarial debates (steel-manned dual-dossier with ranked cruxes). Every claim is published as machine-readable JSON-LD by default.

## Run

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # production build (full type-check)
npx tsc --noEmit     # type-check only, faster
npm run lint         # eslint; session-end and CI both gate on it (only reader of .js/.mjs)
npm run test         # vitest
npm run lint:resolution   # forecast resolution-criteria rigor; session-end and CI gate on --strict
npm run typecheck:mcp     # mcp-server/, which the root tsconfig excludes
npm run typecheck:clients # clients/, likewise excluded
npm run check:built-urls  # asserts over out/; run it after a build
npm run check:config      # ci.yml + wrangler.jsonc; the only reader either has
npm run check:exports     # knip; dead exports, which nothing else in the gate sees
shellcheck $(git ls-files '*.sh')   # shell scripts; session-end and CI both gate on it
```

`lint:resolution` reports forecasts a distrustful reader could not settle:
criteria resolving on an utterance, criteria with no checkable threshold, and
forecasts with no `resolutionSource`. Forecasts marked `supersededBy` are
skipped and listed — their criteria are historical record, repaired by the
replacements they name. Warn-only by default and outside `npm run build`, but
the session-end gate runs it with `--strict` (`build_commands` in
`.claude/lifecycle-manifest.md`), so a session cannot land a forecast a
distrustful reader could not settle.

The repo's two shell scripts are `bin/check-prose.sh`, which is the prose gate
itself, and `scripts/publish-registry.sh`, which handles a signing key and
writes to a public registry. Both are executable behaviour that no Node command
here can reach, so `shellcheck` runs in `build_commands` and as the first step
in CI. That is also why `"*.sh"` is in `code_globs`: the classification only
means something because a shell-aware command sits behind it.

The same rule governs `"*.js"` and `"*.mjs"`. `tsconfig.json`'s `include` covers
`**/*.ts`, `**/*.tsx` and `**/*.mts` but neither `*.js` nor `*.mjs`, and vitest
reads only `src/**/*.test.ts`, so `eslint` is the sole command in the gate that
reads them. `scripts/check-built-urls.mjs` is real code that CI runs, and until
session 46 a syntax error in it passed the whole session-end gate. `npm run
lint` is now in `build_commands`, matching the hard gate CI already had.

`tsconfig.json` excludes `clients` and `mcp-server`, so `npx tsc --noEmit`
covers `src/`, `scripts/` and `worker/` and nothing else. Both sub-packages have
their own tsconfig, and until session 48 the session gate ran neither: a type
error planted in each passed all six commands. `npm run typecheck:mcp` and
`npm run typecheck:clients` are now in `build_commands`. Each provisions its own
`node_modules` before running, so a fresh clone gets a real check rather than a
silent skip.

The session gate and `.github/workflows/ci.yml` used to be two lists that
drifted apart with nothing reporting it, and the instruction here was to read
them against each other by eye. `npm run check:config` now does it: every
`build_commands` entry names the CI step that covers it, and every CI step is
either one of those or listed in `CI_ONLY` with a reason. Adding a step to
either list without settling the other fails the check, so the CI-only choices
below are decisions on the record rather than drift nobody caught.

Four checks stay CI-only on purpose, each argued at its step in `ci.yml`: the
Worker dry-run bundle, which only meaningfully covers the config's wiring to the
entry point, and the three steps around schema-validating the *served* export,
which needs a running server.

`check:config` is also the only reader `ci.yml` and `wrangler.jsonc` have in the
session gate. Session 53 measured the hole by planting a YAML syntax error in
one and a JSON syntax error in the other simultaneously: all nine gate commands
exited 0. The two fail differently, which is why the check runs in CI as well. A
broken `wrangler.jsonc` turns CI's dry-run step red; a broken `ci.yml` stops the
workflow parsing, so it never runs and CI simply goes quiet. A file that
disables the thing meant to catch it cannot be gated from inside itself, and
that is the whole argument for a local reader.

Past parseability it enforces two rules the repo had written down and left to
memory: gate/CI parity above, and the rate-limit period that `wrangler.jsonc`
and `worker/index.ts` each document as mirroring the other. Cloudflare accepts
only 10 or 60 for that period, so the single legal edit is also the one that
makes `retry-after` lie to every rate-limited caller, with tsc, the tests and
the dry-run all staying green.

`check:exports` covers a class of fault every other command here is blind to by
construction. `tsconfig.json` does not set `noUnusedLocals`, and an exported
symbol is used as far as `no-unused-vars` is concerned, so a declaration nothing
imports type-checks, lints, tests and builds clean indefinitely. Session 54
found `useGraphInstance` that way, by reading the code during an audit, and
asked for a gate that would have named it. Pointed at the tree it was added to,
knip named 30 more: 24 exported but only ever used inside their own file, 3 dead
outright, and 3 that were the tool being wrong.

Those last three are the reason the config is worth reading. `src/lib/types.ts`
pairs `export const X = z.enum(...)` with `export type X = z.infer<typeof X>`
for every schema, and for `SourceKind`, `AnalysisKind` and `ResolvedOutcome`
nothing currently imports the runtime half. That is a fact about today's call
sites, not evidence the schema is dead, so the file is named as an entry point
in `knip.jsonc` with the argument written next to it. A contract file is exactly
where "no importer" stops meaning "delete it". The one other exemption,
`tailwindcss`, is reached through `@import` in `globals.css` and postcss, which
knip resolves through neither.

`knip.jsonc` also carries the entry points knip cannot infer, and getting those
wrong is how this kind of gate becomes noise: run bare, it reported all three
`worker/*.ts` files as unused, then the dependencies only they import, then the
`src/lib/mcp/*` exports only they consume. `wrangler.jsonc` names only
`worker/index.ts` as `main`; `mcp.ts` and `oauth.ts` are reached through the
OAuth provider's config object rather than a static import, so all three are
listed by hand.

The second used to be a real hole, because nothing in `npm test` validated
serializer output at all. `src/lib/jsonld.test.ts` closes the part that matters:
it runs `graphLD` and `fullClaimLD` over a fixture exercising every claim kind,
every edge kind and every optional branch, and validates the result against
`public/schema/v0.json` with the same Ajv construction `clients/validate.ts`
uses. Serializer drift now fails `npm test` naming the field. What stays CI-only
is narrower and still worth having: that the *built static export* serves those
documents over HTTP, which is a claim about routing and `output: "export"`
rather than about the serializers.

## Architecture

The data layer is a filesystem CMS — each claim is a Markdown file with YAML frontmatter; forecasts, dossiers, and edges are YAML. The runtime reads `data/` at module load and validates everything against the Zod types.

- `data/<domain>/claims/<id>.md` — frontmatter is the metadata, body is the statement.
- `data/<domain>/forecasts/<id>.yaml` — full forecast with predictions.
- `data/<domain>/dossiers/<claim-id>.yaml` — dual-dossier debate.
- `data/<domain>/edges.yaml` — intra-domain edges.
- `data/cross_domain_edges.yaml` — edges spanning domains (cross-domain by design — see `research/vision.md`).
- `public/schema/v0.json` — JSON Schema describing the JSON-LD output. Authoritative.
- `research/schema.md` — human-readable spec.
- `src/lib/data/loader.ts` walks `data/`, parses, validates, returns a `ClaimGraph`. Module-level memoized.
- `src/lib/types.ts` — Zod schemas + derived TS types. Validates incoming data at load time.
- `src/lib/graph.ts` — thin accessor layer over the loader's `ClaimGraph`.
- `src/lib/jsonld.ts` — serializes a `ClaimGraph` to JSON-LD with `schema.org` + `aboard:` context.
- `src/components/graph/` — the React Flow graph: `ClaimGraphRF.tsx` plus node, edge, popover and modal components, and `persist.ts` for localStorage layout.
- `src/lib/engine-adapter.ts` — `ClaimGraph` to `EngineGraphData`; `src/components/graph/engine-to-rf.ts` takes that to React Flow nodes and edges. The "engine" in both names is the data shape, which outlived the vanilla-JS engine it was built for.
- `src/app/api/` — JSON-LD endpoints (`/api/graph`, `/api/claims/[id]`). Output validates against `public/schema/v0.json`.
- `clients/` — independent npm package with a TypeScript reference adapter (`validate.ts`, `briefing.ts`) consuming the JSON-LD endpoints.

## Rules

- No `any`. Strict TS only. If a type is unclear, model it explicitly with Zod.
- Every agent-generated content carries an `AgentAttribution` (model + prompt title + timestamp). Never strip attribution.
- Sources must be real URLs. If a claim cites a paper or dataset, the URL goes to the actual landing page, not a fabricated one.
- `data/` is the source of truth for claims, forecasts, dossiers, edges. Add or change content there, not in code.
- Claim IDs are globally unique across domains. New domains use a domain-specific prefix (e.g. `IS1`/`IM1`/`IL1` for `inequality`) to avoid collisions with existing IDs like `S1`/`M1`/`L1`.
- `public/schema/v0.json` is the spec. If you change `jsonld.ts` or `types.ts`, update the schema (and `research/schema.md`) in the same commit.
- No `console.log` in committed code. Use real logging if needed.
- Keep each `.tsx` page file under ~250 lines — split when larger by responsibility.
- Server components by default. Add `"use client"` only when interactivity demands it.

## File Layout

```
data/                                   source of truth for claims (filesystem CMS)
  <domain>/
    claims/<id>.md                      frontmatter + body (statement)
    forecasts/<id>.yaml
    dossiers/<claim-id>.yaml
    edges.yaml
  cross_domain_edges.yaml               edges spanning domains (CE1–CE3 live)

public/schema/v0.json                   JSON Schema validating the JSON-LD API

src/
  app/
    page.tsx                            landing (inline graph)
    graph/page.tsx                      fullbleed graph + editor toolbar
    claims/[id]/page.tsx                claim detail
    dossiers/[claimId]/page.tsx         dual-dossier debate
    about/page.tsx                      explainer
    api/claims/[id]/route.ts            single-claim JSON-LD
    api/graph/route.ts                  full-graph JSON-LD
    opengraph-image.tsx                 site OG card
    claims/[id]/opengraph-image.tsx     per-claim OG
    dossiers/[claimId]/opengraph-image.tsx  per-dossier OG
    layout.tsx                          header, footer, fonts
    globals.css                         Tailwind v4 + design tokens
  components/
    ClaimGraphCanvas.tsx                mounts ClaimGraphRF; inline/fullbleed modes
    GraphFullbleed.tsx                  fullbleed page chrome + toolbar
    InterpretationCard.tsx              claim interpretation panel
    ThemeToggle.tsx                     system/light/dark
    graph/                              React Flow graph
      ClaimGraphRF.tsx                  the canvas: state, wiring, render
      ClaimNode.tsx, ClaimEdge.tsx, DomainGroupNode.tsx, RowLabels.tsx
      NodeEditorModal.tsx, EdgeEditorModal.tsx, BulkActionsToolbar.tsx
      NodePopover.tsx, EdgePopover.tsx, EdgeMarkers.tsx
      engine-to-rf.ts                   EngineGraphData to React Flow; collapse/expand
      graph-ops.ts                      pure transforms the state updaters apply
      history.ts                        the undo stack as data
      seed.ts                           canonical build or persisted sandbox
      use-graph-history.ts              undo/redo bound to React Flow
      use-graph-editing.ts              the two editor modals
      use-bulk-actions.ts               the multi-select toolbar's actions
      persist.ts                        localStorage layout
      GraphContext.tsx, align.ts, jsonld-export.ts, types.ts
  lib/
    data/loader.ts                      walks data/, validates with Zod
    graph.ts                            accessor layer
    types.ts                            Zod schemas + TS types
    jsonld.ts                           JSON-LD serializers
    vocab.ts                            published IRIs: context, schema URL, version
    site.ts                             deploy-following display origin (SITE_URL)
    engine-adapter.ts                   ClaimGraph → engine data shape

clients/                                independent npm package
  validate.ts                           validates /api/graph against v0 schema
  briefing.ts                           renders Markdown briefing from API
  package.json, tsconfig.json
scripts/
  forecasters/ensemble-predict.ts       multi-provider ensemble forecast generator
  lint-resolution.ts                    resolution-criteria rigor lint
  check-built-urls.mjs                  post-build check: no localhost in out/
  publish-registry.sh                   signs and publishes the MCP server card
research/                               landscape, vision, schema docs
sessions/                               per-session work logs (created by /lifecycle-kit:session-end)
knowledge/                              issues.md and other long-lived notes
.claude/lifecycle-manifest.md           config for the lifecycle-kit + knowledge-kit plugins
```

## Sessions

The session lifecycle comes from the `lifecycle-kit` plugin, configured by
`.claude/lifecycle-manifest.md`. aboard used to carry its own copies of these
skills; they were deleted in favour of the kit so there is one version to
maintain. Change the manifest, not the skills, to alter how they behave here.

Run `/lifecycle-kit:session-start` to open a session with a briefing of where
things left off, and `/lifecycle-kit:session-end` to finalize: it gates on the
manifest's `build_commands` (`npx tsc --noEmit` then `npm run build`), updates
today's log in `sessions/`, and lands the session's PR. Session logs track what
was done, decisions made, files changed, and what's next, so future sessions stay
informed without relying on conversation history.

`/commit`, `/verify`, and `/prune-branches` remain aboard-local; the kit has no
equivalent.

## Commits

Convention: `prefix(topic): short description`

**Prefixes:**
- `feat` — new feature or capability
- `fix` — bug fix
- `refactor` — structural change with no behaviour change
- `docs` — documentation, session logs, research
- `chore` — config, scripts, tooling, dependencies

`refactor` was added in session 55, which produced seven commits the other
four prefixes could only misdescribe: a 1207-line component split into tested
modules, changing no behaviour. Filing that under `chore` (documented as
config and tooling) or `fix` (no bug) would have made the prefix say less than
nothing. A deliberate behaviour change inside a restructure is still its own
`fix` commit, so the distinction stays honest.

**Topics:** `claims`, `graph`, `dossier`, `forecast`, `schema`, `jsonld`, `ui`, `data`, `lib`, `scripts`, `mcp`, `research`, `sessions`, `config`, `deps`, `claude`

**Rules:**
- Commits must be atomic — one logical change per commit
- No `Co-Authored-By` trailers
- Message body is optional; use it only when the "why" isn't obvious from the title
- Keep title under 72 characters

## Pull Requests

PR titles use the same convention as commits, with a trailing session
reference: `prefix(topic): description (session N)`.

- Pick the `prefix`/`topic` of the PR's headline change. A session PR
  that bundles several types (e.g. a `fix` plus `docs`) takes the
  dominant one — don't invent a combined prefix.
- The `(session N)` suffix ties the PR to its session log in `sessions/`.
  Use `(sessions N–M)` if it spans several, or omit it for a PR that
  isn't session-scoped.
- No `🤖 Generated with…` or `Co-Authored-By` trailers in the PR body.
- Examples: `feat(graph): boundary edges visible on collapse (session 11)`,
  `chore(claude): /prune-branches skill + docs de-stale (session 8)`.

## Verification

After any change to `src/`, confirm it type-checks and builds:

```bash
npx tsc --noEmit 2>&1 | tail -10
```

After any change under `bin/` or `scripts/*.sh`, run `shellcheck` on it. Nothing
else in the gate reads shell, so this is the only automated check that will.

After any change to a `.js` or `.mjs` file, run `npm run lint`. `tsc` does not
read either extension, so eslint is the only automated check that will.

After any change under `clients/` or `mcp-server/`, run `npm run typecheck:clients`
or `npm run typecheck:mcp`. The root `tsc` excludes both directories, and `tsx`
runs them without type-checking, so nothing else reads them.

After deleting a call site, run `npm run check:exports`. Removing the last
importer of something is what turns a live export into a dead one, and that is
the moment no other command in the gate will say so. The same check reads
`knip.jsonc`, so run it after editing that too.

After any change to `.github/workflows/ci.yml` or `wrangler.jsonc`, run
`npm run check:config`. Nothing else in the gate parses either file. Editing
`ci.yml` is the case to be careful with, because a mistake there does not turn
CI red, it stops CI running at all.

After any change under `data/`, run `npm run build`. The build is the data gate
(the Zod loader plus the referential-integrity checks), and `*.yaml` was outside
`code_globs` until session 53, so a forecast-only session classified as docs and
skipped the one command that validates what it changed.

After any change to `src/lib/jsonld.ts` or `src/lib/types.ts`, run `npm test`.
`src/lib/jsonld.test.ts` validates serializer output against
`public/schema/v0.json`, which is the only automated check that will: the
serializers declare no return types, so dropping a schema-required field just
narrows the inferred type and `tsc` exits 0. Verified by planting exactly that
fault. Remember the schema is the spec, so a deliberate shape change means
editing `public/schema/v0.json` and `research/schema.md` in the same commit,
and that test is what holds the three in agreement.

After any change under `src/components/graph/`, run `npm test`. Since session
55 the graph's arithmetic lives in pure modules with their own suites
(`graph-ops`, `history`, `seed`, the collapse and expand pair in
`engine-to-rf`), and a slot column, a coordinate conversion or a dropped undo
step is a defect `tsc` and the build both accept. What no suite reaches is the
canvas wiring, so a change to `ClaimGraphRF.tsx` or a `use-*.ts` hook still
wants a browser pass against `npm run build` output rather than `npm run dev`.

One caveat on that browser pass, measured in session 55 and reproduced on the
base commit before being believed: an automated tab reports
`document.visibilityState === "hidden"`, never paints, and therefore never
fires `requestAnimationFrame`. Since every commit path defers to rAF, nothing
persists and no node is ever rendered. Patch `window.requestAnimationFrame` to
a timer in the console to drive it. `reset` freezes such a tab outright, on
`main` as much as on a branch.
