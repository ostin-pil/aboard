# Code-quality audit — 2026-07-18, revised 2026-07-19 (v2), status current 2026-08-11

A read-only audit of aboard's stack against current (2026) best practices.
v1 was a seven-agent pass; each agent researched its technology and audited the
actual code. **v2 is a four-agent verification-and-extension pass run against
post-merge `main` (`8bdecb2`, which includes PRs #46/#47/#48):** every v1
finding was re-checked at current line anchors, four severities were corrected,
the B-section counts were re-measured, the feasibility of every proposed gate
was probed against installed versions, and two gap-hunts covered the areas the
first pass missed (section E). Raw per-agent reports from both passes were
session-scoped and are gone; **this document is the self-contained record.**

**Since v2 this document carries one status section, not a stack of sweeps.**
It sits directly below and is rewritten in place; the A-E bodies keep their
original wording as the historical record, with severity cells marked so a
reader of the tables cannot act on a dead finding. Where a later session
corrected a finding's *premise* rather than fixing it, the correction lives in
that finding's own row and takes precedence over anything said about it
elsewhere in this file, including in the v2 deltas immediately below.

Stack audited: Next.js 16.2.6 (App Router, `output:"export"`), React 19.2.4,
@xyflow/react 12.10.2, TypeScript strict, Zod 4.4.3 (mcp-server: Zod 3.25.76),
Tailwind v4, the Cloudflare Worker write path, the `mcp-server/` package,
Vitest 4.1.10 (95 tests green).

## What v2 changed (review deltas)

- **All nine A findings re-confirmed** on current `main`; `worker/index.ts`
  anchors refreshed (PR #46 shifted them).
- **Four severity corrections, all downward** — the defects are real but their
  blast radius was overstated: A3 HIGH→MED, A5 MED→LOW, A7 MED→LOW, A9 MED→LOW
  (reasons in the table).
- **One enforcement claim corrected in C:** CI *already* validates the built
  JSON-LD against `v0.json` — the `clients/validate.ts` step runs against the
  served `out/` and passes today. A3 is therefore a *fail-late* problem (caught
  at the last CI step with an Ajv error), not a missing-enforcement problem.
- **One mechanism correction in D:** `ClaimNode`'s zoom `useStore` already uses
  a scalar selector; the per-frame re-render offender is the selector-less
  `useConnection()`. The raw-`transform` subscription lives in `RowLabels.tsx`,
  which legitimately needs it.
- **B counts re-measured:** enum duplication is 9+ sites (not 7); OG hex
  duplication is 59 occurrences of 15 distinct colors (not "~30+"); `"v0"`
  literals ~13 (not ~8). B4's collision severity downgraded: client-minted ids
  never reach `data/` from this repo — the surface is localStorage and exported
  packs, not server persistence.
- **~25 new findings (section E).** The sharpest: the landing page's inline
  graph hydrates the `/graph` editor's localStorage sandbox (E1), and the
  Worker validates proposals against a deploy-frozen graph snapshot with no
  deploy automation (E10). *Corrected in session 51: deploy-on-merge does
  exist, through Cloudflare Workers Builds wired via the dashboard rather than
  `.github/`, which is why looking in `.github/workflows` suggested otherwise.
  See E10's row.*

## Current status — rewritten 2026-08-11 (session 52), amended by session 54

**This section is replaced wholesale, never appended to.** v1, v2 and v3 each
added a layer, and by session 51 the v3 layer was itself wrong in four places:
it still listed A3, A4 and E10 at their original severities and said
`scripts/forecast-sanity.ts` was unported, after sessions 49, 50 and 51 had
closed the first two, downgraded the third on evidence, and done the port. An
audit whose status accretes is an audit that misleads the sessions reading it
to choose work, which is the opposite of what it is for. One block, always
current, is the fix.

Every line here was verified against the code on `main` at `0d60660`, not
carried forward from a previous sweep.

Session 54 amended this block rather than rewriting it: it moved E5 through E9
from Still-live to Closed, re-measured the two line counts below, and left every
other row as session 52 verified it. Those rows are therefore as old as their
anchor says, which is the point of naming the anchor.

Older annotations further down are marked "v3". That was the 2026-08-08 sweep
this block replaced; the label is kept where another session wrote it, so the
attribution stays honest.

### Closed

| # | Closed by | Evidence today |
|---|---|---|
| A1 | batch 1 | `metadataBase` in `layout.tsx`, asserted by `canonical-urls.test.ts`, with `check-built-urls.mjs` as the built-output net |
| A2 | batch 1 | Zero `aboard.dev` in shipped source; `src/lib/vocab.ts` is the single vocabulary source |
| A3 | session 50 | Six timestamp fields on `Iso8601`, zero bare `z.string()` dates. The pattern copies `$defs/Iso8601` character for character |
| A4 | session 49 | `SUPPORTED_EDGE_KINDS` survives only as a historical comment, the drop-filter is gone, and `EngineEdge["kind"]` *is* `EdgeKind`, so the four render and edit sites cannot drift |
| A5 | session 47 | `HttpUrl` in `types.ts`, a Zod-3 mirror in `mcp-server`, `v0.json` and `research/schema.md` narrowed to match |
| A6 | session 47 | PR-body builders moved to `src/lib/pr-body.ts` and caller text contained in a fence whose length is computed from the content. `pr-body.test.ts` runs a forged-provenance payload through all four builders |
| A7 | session 47 | A `LIMITS` block over every caller string and array, plus a `content-length` guard, sized so the largest legal proposal renders inside GitHub's 65,536-character PR body |
| A8 | session 47 | Handler returns a structured 500; `gh()`'s fetch turns a network throw into a synthetic 502 |
| A9 | session 47 | `resolveStaticIdentity` validates per entry with Zod instead of casting |
| E1-E4 | batch 2 | Inline isolation, Zod-validated persistence, seed hash, undo/redo re-measure. Shipped as `fix/graph-state-integrity` |
| E5 | session 54 | `addNode`/`undo`/`redo` refuse with edit mode off or an editor open, guarded on the instance so the shortcut and the toolbar take one path; the toolbar buttons carry `disabled` rather than silently no-opping |
| E6 | session 54 | One `ModalDialog` shell behind all three modals: `role`, `aria-modal`, `aria-labelledby`, initial focus, a Tab trap and Escape, with focus restored on close. `focus-trap.test.ts` runs the ordering under jsdom |
| E7 | session 54 | The expand transform is now `expandGroupNodes`/`expandGroupEdges` in `engine-to-rf.ts`, and filing into a collapsed group runs it, so the claim lands inside a group the user can see |
| E8 | session 54 | `mintClaimId` derives the prefix from the domain's own claims, falling back to the domain's initials. Filing a symptom into `inequality` mints `IS4`, verified in the browser |
| E9 | session 54 | All four: confidence clamped at the input, the persisted-sandbox read made write-free, both flash timers cleared and `clipboard.writeText` given a rejection path, `useGraphInstance` deleted |
| E11 | session 47 | `locationErrors` asserts filename-equals-id, directory-equals-domain, and that a forecast or dossier sits with its claim |
| E12 | session 65 | `EngineEdge` carries `canonicalId` and `strength`, so a seeded edge exports as itself: its id, calibrated strength, rationale and sources all round-trip, and a sandbox-drawn edge is minted after the file's maximum on the domain's own stem. `exporter.test.ts` runs the real graph through loader → engine → exporter and asserts the result is a no-op against `data/` |
| E15 | session 65 | All of it. `appendEdgeToYaml`'s empty-file guard parses instead of comparing strings (`[] # comment` produced invalid YAML); `nextSequentialId` matches stems as literal text; the duplicate-relation refusal is a `409 duplicate_relation` in both `buildEdge` and the Worker's base-ref check; the `/api/proposals` CORS decision and the claims route's dev-only 404 branch are argued at their sites |
| E16 | session 65 | `readDirIfExists` sorts, so claims, forecasts, dossiers and analyses all load deterministically. `loader.test.ts` reverses `readdirSync` and asserts sorted order, which is the one loader property the build cannot check |
| E17 | session 65 | `--update` runs `Prediction.safeParse` per result (naming the provider) and `Forecast.safeParse` over the whole file before writing, and appends through `appendPredictionToForecast` — measured on F7: 7 lines added, every prior line byte-identical, where the old whole-file re-stringify reformatted all 57 |

Also closed from the C and D lists: the route error boundary, the
`about/page.tsx` split, `vocab.ts`, both forbidden-string gates, the enum-sync
test, the early schema-drift test (`jsonld.test.ts`), `z.strictObject` across
all twelve data schemas, the `clients/` and `mcp-server` type-checks in the
gate, and `scripts/forecast-sanity.ts` ported to `src/lib/forecast.test.ts` and
deleted.

### Still live, verified today

| # | State on `0d60660` |
|---|---|
| B (hex) | `src/lib/tokens.ts` still does not exist; 59 re-typed hex values across the three OG images |
| E10 | Partly closed, and **downgraded on evidence** — read its row, which session 51 rewrote and which supersedes anything said about E10 elsewhere in this file. Two v2 premises were wrong (deploy-on-merge exists via Workers Builds; concurrent minting surfaces as an add/add conflict, not silently), the collision is now a structured `409 id_collision`, and what remains is the option of reading ids live at `ctx.base`. The stale *edge* id was closed in session 65: the edge path already reads its target file at the base ref before committing, so the collision is checked there and answered as the same `409 id_collision`, before a branch is cut |
| ~~E12~~ | Closed in session 65: the PR pack preserves edge identity and strength |
| ~~E15~~ | Closed in session 65: the one-liners and the duplicate-relation refusal |
| ~~E16~~ | Closed in session 65: every directory listing sorts |
| ~~E17~~ | Closed in session 65: `--update` validates and appends rather than re-stringifying |
| ~~E18~~ | Closed in session 64: the stdio default is the production origin |
| E19 | The dark token set is still duplicated between `[data-theme="dark"]` and `prefers-color-scheme` |
| E20 | Tailwind is imported and **zero** utility classes are used anywhere. Adopt or drop |
| E21 | Robots and sitemap halves closed; `alternates.canonical` and `/graph` metadata still open |
| C | `--max-warnings 0` (13 warnings, blocked on the `Claude Design Screens/` decision), `noUncheckedIndexedAccess` (48 errors, probed), coverage thresholds, dependency gate |

Two gaps named by later sessions, not in the original audit: `code_globs` has no
reader for config, so `ci.yml` and `wrangler.jsonc` are unchecked (session 48);
and a stale `nextSequentialId` for an *edge* still appends a duplicate that
fails at CI rather than at submit (session 51, deliberately out of its scope).

### Moving the wrong way

`ClaimGraphRF.tsx` is **1207** lines, against 1139 at the last measurement, 1128
before that and 1101 when v2 wrote the finding. `claims/[id]/page.tsx` holds at
419 against 411. Both splits get more expensive every session that does not do
them.

Session 54 is why the first number jumped 68: closing E5 through E9 added
guards, an expand path and their reasoning to the very file that most needs
splitting. It did move the collapse and expand transform out to
`engine-to-rf.ts`, where it is now pure and tested, so the direction is right
even though the count went the wrong way. A session that takes the split should
expect the file to fight back, and should probably do it before the next round
of graph findings rather than after.

### Anchor warning

`worker/index.ts` has been rewritten repeatedly since v2 (OAuth added ~260
lines, session 47's extraction removed ~140, session 51 changed the proposal
path). Every worker line number in sections A and E is stale. Re-locate by
content, never by line.
## Already resolved (state on `main` as of v2, 2026-07-19)

- **Write-path rate limiting — merged (PR #46).** Verified: `PROPOSAL_LIMITER`
  binding (`wrangler.jsonc`, 10/min per credential), 429 + `retry-after` at
  `worker/index.ts:724-736`, deliberate fail-open in `src/lib/rate-limit.ts`
  with unit tests. Still missing, as v1 said: a CI assertion that the binding
  exists (the wrangler dry-run passes even with the `ratelimits` stanza
  deleted, because the Env field is optional and the code fails open) and an
  integration test that the N+1th request 429s (no test imports
  `worker/index.ts` at all).
- **Lint hard-gate — merged (PR #47).** Errors block; warnings don't (no
  `--max-warnings`). Current: 0 errors, 15 warnings — 9 of them from the
  git-tracked `Claude Design Screens/` mockup directory, which *is* linted.
- **CI already covers more than v1 implied.** One job runs: `tsc --noEmit` →
  `npm test` (hard) → lint (hard on errors) → `npm run build` (the data gate —
  Zod loader + referential integrity over `data/`) → `wrangler@4 deploy
  --dry-run` (Worker bundle; the Worker imports the canonical schemas from
  `src/lib`) → mcp-server `npm ci` + typecheck → clients `npm ci` →
  `clients/validate.ts` served-output validation against `/api/graph` and
  `/api/claims/S2`. The C-section now marks what this already covers.

## A. Real bugs to fix

All nine re-verified 2026-07-19. Sev column shows the corrected severity;
strikethrough marks a v1 downgrade.

| # | Sev | Where | Bug | Fix |
|---|-----|-------|-----|-----|
| A1 | ~~HIGH~~ **CLOSED** | `src/app/layout.tsx:20-38` | No `metadataBase` (zero hits repo-wide). Under static export every page emits `og:image`/`twitter:image` against `http://localhost:3000` — **verified in `out/`: 126 occurrences across 32 of 33 pages** (62 meta tags + 64 duplicates in the RSC flight payload). Every social unfurl in production is broken; the three `next/og` generators render but are never referenced. `siteBaseUrl()` exists in `site.ts` but only feeds JSON-LD. | `metadataBase: new URL(siteBaseUrl())` in root-layout metadata. Also fix the stale `next.config.ts` comment ("when unset, relative IRIs are used" — `site.ts` now defaults to `CANONICAL_ORIGIN`). |
| A2 | ~~HIGH~~ **CLOSED** | `claims/[id]/opengraph-image.tsx:176`, `dossiers/[claimId]/opengraph-image.tsx:117`, `src/components/graph/jsonld-export.ts:9` | Dead domain `aboard.dev` at exactly these 3 sites (repo-wide grep). Worse than v1 said: the client "Copy JSON-LD" export is wrong **three ways** — dead domain, a `/schema/v0` path that doesn't exist on the live origin either (real: `/schema/v0.json`), and a document shape (`filedBy`/`filedAt`/`relations`) that doesn't conform to `v0.json` at all. Two published JSON-LD dialects, not just two origins. | Derive from `siteBaseUrl()` / a shared `vocab.ts`; make the client export emit the canonical shape (or reuse `jsonld.ts`). |
| A3 | ~~HIGH~~ **CLOSED** | `src/lib/types.ts:7,72,95,126,134` | Five timestamp fields are bare `z.string()`; `v0.json` requires the ISO-8601 pattern on all of them (v1's "lines 132/136" were stale anchors for the single `resolutionDate`). Downgrade rationale: CI's `clients/validate.ts` step **does** catch non-conforming output — but only post-build, at the last CI step, with an Ajv error far from the offending file. Also `engine-adapter.ts:54` does `createdAt.slice(0,10)` — silent junk for non-ISO strings. | Tighten to `z.iso.datetime()` (exists in Zod 4.4.3) so bad data fails the loader with a named file, not the CI tail. |
| A4 | ~~HIGH~~ **CLOSED** | `engine-adapter.ts:15`, `src/types/global.d.ts:45`, `EdgeEditorModal.tsx:43-45`, `ClaimEdge.tsx:16-26` | The 4th edge kind **`evidences`** (canonical in `types.ts:99` + `v0.json:142`) is missing from all four render/edit sites; `engine-adapter.ts:68` silently drops such edges (and the `:76` cast is only sound because of that filter). Latent today — `grep evidences data/` is empty (25 edges: causes ×14, reduces ×8, moderates ×3) — but `mcp-server/src/tools/write.ts:50` accepts it, so an agent can mint one via the live write path and the graph would silently omit it. | Derive all four sites from `EdgeKind.options`; enum-sync test (C). |
| A5 | ~~MED~~ **CLOSED** | `types.ts:38`, `mcp-server/src/tools/write.ts:29` | `z.string().url()` accepts `javascript:`/`data:`/`vbscript:` — **verified by execution under both installed Zod majors** (4.4.3 and 3.25.76). Downgrade rationale: the only sinks are React 19 `<a href>`s (`claims/[id]/page.tsx:382`, `dossiers/[claimId]/page.tsx:144`), and React 19 blocks `javascript:` hrefs at render; no `innerHTML`-class sinks exist; the write path never auto-merges. Residual: unsafe schemes stored in `data/`, abusable in PR-body markdown links (A6) and any future non-React renderer. | Defense-in-depth: constrain `Source.url` to `http(s)` at both sites. |
| A6 | ~~MED~~ **CLOSED** | `worker/index.ts:329,338,347,375,410,437,441-443` | Caller-controlled `rationale`/`statement`/`thesis`/`sources[].label` interpolated **unescaped** into the reviewer-facing PR body (no escaping anywhere in the file). The statement blockquote at `:347` contains newlines but not inline markdown. A malicious agent can forge a second `## Provenance` block above the genuine one (built at `:315-325`) or a pre-ticked checklist — on the exact surface the human trusts to gate the merge. Reviewer deception, not script execution (GitHub sanitizes). | Escape/fence caller text; keep the machine-stamped provenance visually unforgeable (e.g. fence all caller content in code blocks). |
| A7 | ~~MED~~ **CLOSED** | `src/lib/proposals.ts` schemas, `worker/index.ts:744` | Zero `.max()` on any payload string/array (every existing `.max()` is a numeric range); `request.json()` buffers with no content-length guard. Downgrade rationale: the path is post-auth **and now post-rate-limit** (10/min/credential), Cloudflare caps bodies ~100 MB, and GitHub rejects PR bodies >65,536 chars (a giant rationale 502s as `github_failed` rather than exhausting anything). | `.max()` bounds on every user string/array; reject oversized `content-length` before parsing. |
| A8 | ~~MED~~ **CLOSED** | `worker/index.ts:771-780,124,209` | No try/catch around the fetch handler (`:771-780`) — any uncaught throw is a bare Workers 500, not the structured envelope. `readGraph`'s `res.json()` (`:124`) guarded for `!res.ok` but not parse failure. `gh()`'s `fetch` (`:209`) propagates network TypeErrors; `withRetry` doesn't catch throws either. Narrowed from v1: `gh()`'s *json parse* IS guarded (`:219`), and `handleEdge`/`handlePrediction` already wrap `getFile` into structured 502s — the gap is the fetch-throw case, `submitProposalPR`, and `readGraph`. | Wrap handler → structured 500; guard `readGraph` (→503); wrap the GitHub fetch (→502). |
| A9 | ~~MED~~ **CLOSED** | `worker/index.ts:88-95` | `JSON.parse(env.ABOARD_AGENT_TOKENS) as Record<…>` — try/catch covers JSON syntax only; `TokenIdentity` is a plain type, never validated. Downgrade rationale: a missing `agent` already fails the content build with a 422 (`AgentAttribution.agent` is required); the silent loss is confined to optional `operator`/`agentId` — branch names become `agent/undefined/…` and provenance prints `**operator** undefined`. Config footgun, not an exploit (the secret is operator-set). | `z.record(TokenIdentity-schema).safeParse` at startup; refuse to serve on failure. |

## B. Hardcode & duplication (quantified, re-measured)

The hunch was right, and it is mostly **duplicated vocabularies and re-typed
tokens**, not loose numbers. Ranked by drift risk:

- **[HIGH] Enum duplication → live `evidences` drift (A4).** `ClaimKind`/`EdgeKind`
  re-declared at **9+ sites** beyond canonical `types.ts:47,99`: `global.d.ts:21,45`
  (with the *renamed* `leverage`), `engine-adapter.ts:3-15,42`,
  `EdgeEditorModal.tsx:43-45`, `ClaimEdge.tsx:16-26`, `mcp-server/src/types.ts:19,71`,
  `mcp-server/src/tools/write.ts:49-50`, plus three sites v1 missed:
  `NodeEditorModal.tsx:19-23,121-123`, `src/lib/data/exporter.ts:19-23`
  (`KIND_MAP`), `clients/briefing.ts:43,55`.
- **[HIGH] Design-token hex re-typed in the 3 OG images — 59 occurrences, 15
  distinct colors** (14 + 27 + 18 per file), every one verbatim from
  `globals.css:9-53`. Satori can't read CSS vars — legitimate — but they should
  come from one TS palette module (`src/lib/tokens.ts`), not three hand-copies.
- **[HIGH] Origin/IRI drift (A2).** Canonical origin exists 3×: `site.ts`
  (`CANONICAL_ORIGIN = aboard.untype.me`), `jsonld.ts:18-21` vocab IRI
  (deliberate literal, per its comment), `jsonld-export.ts` (`aboard.dev`).
  Source: `site.ts` + a `vocab.ts`.
- **[MED, was HIGH] kind→row and kind→letter maps duplicated with inconsistent
  keys.** `engine-adapter.ts:3-7` (`leverage_point`) vs `NodeEditorModal.tsx:19-23`
  (`leverage`) — both internally type-safe today (translation maps exist), so a
  confusion hazard, not a live bug. `proposals.ts:120-124` `KIND_LETTER` vs the
  `ClaimGraphRF.tsx:511-519` ternary that ignores the domain prefix — **but the
  client-minted id is never persisted server-side from this repo** (no fetch to
  `/api/proposals` anywhere in the graph UI; it reaches localStorage, the "Copy
  JSON-LD" export, and PR packs). Collision surface is exported artifacts and
  future server mints, not `data/`. See E8 for the concrete fix.
- **[MED] Loose graph magic numbers** — `getDefaultNodePosition` `-120/-40`,
  `+96` group pad, fitView `duration/padding`, `minZoom/maxZoom`, popover
  `setTimeout(180)`, edge stroke/opacity. Fold into `LAYOUT`/a `GRAPH_UX` block
  (the existing `LAYOUT`/`HISTORY_LIMIT` are the model).
- **[MED] `COLLAPSED_GROUP_W/H = 220/56`** — exported from `engine-to-rf.ts:34-35,186`
  yet re-declared locally in `ClaimGraphRF.tsx:69-70`. Import the export.
- **[MED] Repeated literals (re-counted):** `promptTitle "Agent proposal via
  /api/proposals"` — exactly 3 (`proposals.ts:227,375,442`). Sentinel
  `"agent:reader/v0"` — exactly 7 in `src/` (4 `===` comparisons, 2
  assignments, 1 display), plus relatives `"agent:sandbox/v0"`
  (`exporter.ts:110`) and `"agent:unknown"` (`jsonld-export.ts:24`). `"v0"`
  version markers — ~13 across layout/pages/OG files. Each wants one named
  source.

## C. Automatable checks to add

Grouped by effort. ✅ marks what CI already has (verified in v2 — v1
under-credited the pipeline). Feasibility facts are from probes against the
installed toolchain, not guesses.

**Already in CI, no action:** type-check, tests (hard), lint (hard on errors),
build-as-data-gate (loader Zod + referential integrity), Worker bundle
dry-run, mcp-server typecheck, **served-output Ajv validation against
`v0.json`** via `clients/validate.ts` (both probed endpoints pass today).

**Cheap, high-value — all shipped except the last:**
- ~~Forecast unit tests~~ **DONE (session 50).** `scripts/forecast-sanity.ts`
  ported to `src/lib/forecast.test.ts` as 29 tests over its 30 assertions, and
  the script deleted so the two cannot drift.
- ~~Enum-sync vitest test~~ **DONE (session 49).** `src/lib/enum-sync.test.ts`,
  scoped to the copies no compiler in this gate reads: the two excluded npm
  packages and the tool-description prose. The in-repo sites were re-keyed off
  the canonical type instead, so `tsc` fails at the site that has not handled a
  new kind, and a test asserting what the compiler proves would be ceremony.
- ~~Early types↔schema drift test~~ **DONE (session 50).**
  `src/lib/jsonld.test.ts` runs `graphLD` and `fullClaimLD` over a fixture
  covering every kind and optional branch, asserts the fixture is valid input
  under Zod *and* valid output under `v0.json`, and uses the same Ajv
  construction as `clients/validate.ts` so the two cannot disagree.
- ~~Forbidden-string gates~~ **DONE (batch 1).** `canonical-urls.test.ts` on
  source, `scripts/check-built-urls.mjs` on `out/`.
- ~~`clients/` type-check~~ **DONE (session 48),** along with `mcp-server`'s.
  Both are in `build_commands` and provision their own `node_modules`.
- `--max-warnings 0` — **still open.** Current reality: 13 warnings, 0 errors.
  Decide the `Claude Design Screens/` mockup dir's fate (eslint-ignore, or
  delete it), fix the remainder, then flip.

**Medium:**
- `jsonld.ts` serializer tests (edge direction, dossier attachment,
  attribution-never-stripped).
- Worker unit tests — PR-body escaping (A6), payload bounds (A7), error
  envelopes (A8), token-table validation (A9), URL-scheme reject (A5). Note:
  **no test file imports `worker/index.ts` today**; exporting its pure helpers
  is the enabling refactor.
- Persisted-state tests — feed malformed payloads to
  `loadPersisted`/`hydrateFromPersisted` (see E2; today `edges: {}` passes the
  shape check and white-screens render, persistently).
- tsconfig: `noUncheckedIndexedAccess` — **probed: 48 errors in 12 files**
  (ensemble-predict 11, forecast.ts 10, tests 12, ClaimGraphRF 4, align.ts 4,
  rest 1-2 each). Tractable, not free; v1's "a handful" understated.
  `exactOptionalPropertyTypes` unprobed — probe before committing.
- eslint additions: `@typescript-eslint/no-non-null-assertion`,
  `no-magic-numbers` scoped to `graph/**`, `no-restricted-syntax` banning
  inline `#hex` (allowlist `tokens.ts`) and non-canonical origins, `max-lines`
  scoped to `src/app/**/page.tsx`.
- `z.strictObject` for data-file schemas — **verified safe: no file in `data/`
  carries a key outside the current schemas**, so the flip is free today and
  makes future frontmatter typos fail loudly.
- Coverage: `@vitest/coverage-v8` + thresholds (start at current, ratchet).
- Dependency gate: `dependency-review-action` + `npm audit --audit-level=high`
  (×3 lockfiles) — this repo merges agent PRs and the Worker holds a PAT.

**Heavier / later:**
- Worker integration tests via `@cloudflare/vitest-pool-workers` — still the
  single highest-value gap (see also E10's stale-graph scenarios): `readGraph`
  fed by real `graphLD` output, auth, routing, error envelopes, 429 on the
  N+1th request, base64 round-trip.
- Zod→JSON-Schema generation — **`z.toJSONSchema` confirmed present in the
  installed 4.4.3**, with two caveats: its output won't structurally match the
  handwritten `$defs` style of `v0.json` (needs semantic comparison or full
  generation, not a text diff), and mcp-server is on Zod 3 (exclude or migrate).
- typescript-eslint `recommendedTypeChecked` (surfaces every `res.json() as T`)
  — scope to `src`/`worker`/`clients`/`mcp-server`.
- `eslint-plugin-jsx-a11y` + an axe-core component test for the modals (E6);
  both got cheaper in session 54, which added `jsdom` and a per-file
  `@vitest-environment jsdom` docblock, so a DOM-backed component test now needs
  a renderer and nothing else. `useGraphInstance` is gone, but the unused-export
  gate (knip or ts-prune) is what would have found it without an audit.
  Prettier/Biome `--check`; split CI into parallel jobs with
  a concurrency group.

## D. Manual refactors (need judgment; not gates)

- **Split `ClaimGraphRF.tsx` (1101 lines — re-verified).** v1's hook list
  (`useGraphHistory`, `usePersistence`, `useDomainFilter`, `useBulkActions`,
  `useNodeEditor`/`useEdgeEditor`) maps cleanly onto the file, and
  **undercounts**: collapse/expand edge-remapping (`:225-333`), popover timer
  management (`:178-191`), and the imperative instance API (`:335-390`) are
  three more extractable units. Biggest single readability win; needs browser QA.
- **Split `claims/[id]/page.tsx`** by section, per the ~250-line page rule.
  **v3:** `about/page.tsx` is done (168 lines). `claims/[id]/page.tsx` is 419,
  up from the 411 v2 measured.
- **Graph hover/drag perf** — corrected mechanics: `focusId` sits in
  `GraphContext` whose value memo has `focusId` in its deps, so every hover
  enter/leave bypasses the `memo()` wrappers and re-renders every node, edge,
  and group; `isNeighbor` is O(E) per node → O(N·E) per hover. Move focus into
  the RF store with per-node selectors (or a split context). Separately, fix
  `ClaimNode`'s **selector-less `useConnection()`** (re-renders every node on
  every pointer move during a connection drag — give it a selector like
  `ClaimEdge`'s). Its zoom `useStore` is already a scalar selector — leave it;
  `RowLabels`' raw-transform subscription is legitimate.
- **Extract `src/lib/tokens.ts`** as the single source for the OG palette (15
  colors; drives B). **v3:** `vocab.ts` landed and closed the origin half of
  this; `tokens.ts` does not exist, so the 59 re-typed hex values stand. The
  enum and kind→row/letter maps still have no single source either (A4, B).
- ~~**Add a route error boundary**~~ **CLOSED:** `src/app/graph/error.tsx`
  exists.
- ~~**De-stale the docs (consolidated list)**~~ **CLOSED**, across two
  sessions. Session 46 fixed the `public/graph-engine.js` renderer description
  in CLAUDE.md and README.md. Session 47 fixed the remaining four: the retired
  `scripts/generate-prediction.ts` (the layout map now lists what `scripts/`
  actually holds), the "empty in v0" `cross_domain_edges.yaml` line (it carries
  CE1–CE3), the `next.config.ts` SITE_URL comment that contradicted `site.ts`,
  and the `mcp-server/src/index.ts` header claiming write tools are stubbed.
  The one description this did not touch is `globals.css` as "Tailwind v4 +
  design tokens", which is true today and becomes wrong only if E20 is decided
  in favour of dropping the dependency.
- **De-duplicate the MCP schemas** (`mcp-server` re-declares payload shapes in
  Zod 3 while the app is Zod 4) — import from `src/lib` or add the sync test;
  a Zod-3→4 migration is a prerequisite for sharing.

## E. Second-pass findings (new in v2)

Grouped by area; severity per finding. These come from the two v2 gap-hunts
over ground the seven v1 agents didn't cover.

### E-I. Graph state & persistence (the cluster batch 1 exists for)

| # | Sev | Where | Defect |
|---|-----|-------|--------|
| E1 | ~~HIGH~~ **CLOSED** | `ClaimGraphRF.tsx:102-118` + `persist.ts` | **The landing page's inline graph hydrates the `/graph` editor's localStorage sandbox.** `loadPersisted()` runs unconditionally; the self-heal check (`mode !== "fullbleed" || …`) exempts inline mode from all validation. Any visitor who ever edited on `/graph` sees their scratch state — all domains, fullbleed coordinates, deleted seeds — on the canonical marketing surface, while the header still shows counts from the real `engineData`. Fix: skip `loadPersisted()` in inline mode (or per-mode keys). |
| E2 | ~~MED~~ **CLOSED** | `persist.ts:49-53` | Corrupt-but-parseable state passes the shape check (only `nodes[0]` is inspected; `edges` never) and **crashes render before any `clearPersisted()` — a persistent white-screen** on both `/graph` and (via E1) the landing page, until manual localStorage surgery. Fix: Zod-validate the payload (per the repo's own rule), try/catch → clear + rebuild; plus the D error boundary. |
| E3 | ~~MED~~ **CLOSED** | `persist.ts:10` | No seed/content versioning: `aboard.graph.v3` invalidates only on a hand-bumped key, so **returning visitors never see content merged into `data/` after their first edit** — for a board whose content is the product. Fix: stamp a seed hash; on mismatch offer refresh/merge. |
| E4 | ~~MED~~ **CLOSED** | `ClaimGraphRF.tsx:347-366` | Undo/redo restores group `style.width/height` without `updateNodeInternals` — reintroducing exactly the stale-measure/undraggable-pill bug the code's own comment at `:322-327` documents (and `knowledge/issues.md` records). Fix: rAF-call `updateNodeInternals` for style-changed groups after undo/redo. |
| E5 | ~~MED~~ **CLOSED** | `GraphFullbleed.tsx:39-65` | Global shortcuts ignore edit-mode and modal state: with editing off, `n`/Cmd+Z still mutate the graph; with the node editor open and focus on a non-input surface, `n` fires `addNode()` → replaces `editingNode`, silently discarding the user's typed draft. Fix: gate on `editable` + no-modal-open. |
| E6 | ~~MED~~ **CLOSED** | `NodeEditorModal.tsx:108`, `EdgeEditorModal.tsx:29`, `GraphFullbleed.tsx:230-259` | Modals: no `aria-modal`, no accessible name, no focus trap/initial focus, no Escape (editors); the JSON-LD modal lacks even `role="dialog"`. Fix: native `<dialog>` or full ARIA + focus management; axe-core test (C). |
| E7 | ~~LOW~~ **CLOSED** | `ClaimGraphRF.tsx:575-595,707-772` | Filing/moving a claim into a collapsed group leaves it visible, detached below the 220×56 pill, edges showing while siblings hide. Fix: auto-expand the target, or apply the collapse path's `hidden`+remap. |
| E8 | ~~MED~~ **CLOSED** | `ClaimGraphRF.tsx:511-519` | `newId` mints bare `S`/`M`/`L` regardless of target domain — violating the repo's domain-prefix convention (`IS1`/`IM1`…) in exported PR packs, colliding across namespaces in the "Copy JSON-LD" `@id`s. (The persistence-scoped severity correction is in B4.) Fix: derive prefix from the resolved domain; validate exported packs with the loader (C). |
| E9 | ~~LOW~~ **CLOSED** | `NodeEditorModal.tsx:145-152`; `ClaimGraphRF.tsx:102-116`; `GraphFullbleed.tsx:24-25,80-84`; `ClaimGraphCanvas.tsx:48-50` | Grab-bag, one line each: confidence input unclamped (typed "5" saves, later fails the loader's `.min(0).max(1)`); `loadPersisted`/`clearPersisted` mutate localStorage inside a render-phase `useMemo`; flash/copy timers never cleared on unmount + `clipboard.writeText` has no `.catch` (button silently sticks on insecure contexts); `useGraphInstance` is a dead graph-engine-era export. |

### E-II. Write path & data integrity

| # | Sev | Where | Defect |
|---|-----|-------|--------|
| E10 | ~~MED~~ **LOW, partly closed s51** | `worker/index.ts:240` (`readGraph`) | **The Worker still mints ids against the deployed `/api/graph` asset**, so a claim or dossier proposal filed inside the deploy window can pick an id that already exists on `main`. Two of the v3 premises were wrong and are corrected here. **(1) Deploy-on-merge already exists**: Cloudflare Workers Builds is wired to the repo through the dashboard, not `.github/`, which is why `ls .github/workflows` looked like no automation. Verified by probing the live site for `--edge-evidences`, a token session 49 merged hours earlier, and finding it in the deployed CSS. The window is therefore one build cycle (minutes), not "until someone remembers to deploy". **(2) "Concurrent agents mint the same id into conflicting PRs" is not silent**: both PRs create the same path, so the second is an add/add merge conflict GitHub shows and a human gates. Annoying, not corrupting. What session 51 fixed: the 422 is now a structured `409 id_collision` naming the id, the path, `retryable: true` and a per-kind remediation (`src/lib/proposal-errors.ts`, tested). Only claims and dossiers can reach it, since they alone `PUT` without a `sha`. **Still open**: a stale *edge* id appends a duplicate id into `edges.yaml` and fails at CI's integrity check on the PR rather than at submit, which is a different defect from this one; and reading ids live from GitHub at `ctx.base` would close the window to zero, at the cost of API calls per proposal. Both are deliberate deferrals, not oversights. |
| E11 | ~~MED~~ **CLOSED** | `src/lib/data/integrity.ts:131-136`, `loader.ts:81-88` | **Frontmatter is never reconciled with file location.** A claim's `domain:` is checked for membership in known domains, not equality with the directory it was loaded from; filenames are never compared with frontmatter `id`. A claim in `data/inequality/` declaring `domain: democratic_backsliding` (or `S2.md` containing `id: S3`) passes CI; JSON-LD mis-groups it, and the Worker's `claimPath()`/`dossierPath()`/forecast path (`worker/index.ts:614-615` derives the path from the *attached claim's* domain) point at files that don't exist → every later proposal against it 502s. Fix: assert dir==domain and basename==id for all four file types in `integrityErrors`. |
| E12 | MED | `src/lib/data/exporter.ts:77-90` | The PR-pack **re-mints edge ids from `E1` and emits whole-file `data/<domain>/edges.yaml` replacements**; its README says "drop the files into `data/`". For an existing domain that deletes every live edge (and integrity passes afterward — the evidence is gone), and the fresh `E1/E2` collide if hand-merged. Fix: mint from the existing-id list (reuse `nextSequentialId`) and emit append-fragments. |
| E13 | ~~LOW~~ **CLOSED s64** | `worker/index.ts:284-313` | Orphaned `agent/…` branches: the branch ref is created first; if the commit PUT or PR POST fails, nothing deletes it. Fixed as written: best-effort ref delete on both failure paths, pinned by `worker/route.test.ts`. |
| E14 | ~~LOW~~ **CLOSED s64** | `worker/index.ts:716,724` | Limiter ordering: auth precedes the rate limit, so the 401 path is entirely unthrottled (bearer-token guessing is bounded only by platform protections — fine while tokens are high-entropy; worth a comment). Conversely the limiter runs before payload validation, so agents burn their 10/min on 422s while debugging. Both are defensible; made deliberate in session 64 — the order is kept, argued at the site, and pinned by `worker/route.test.ts`. |
| E15 | LOW | `src/lib/data/serialize.ts:67-72`; `src/lib/proposals.ts:168`; `worker/index.ts:712-714`; `src/app/api/claims/[id]/route.ts:19-21` | One-liners: `appendEdgeToYaml`'s empty-file guard is string-equality (`"[]"`) — `[] # comment` produces invalid YAML in the proposal PR; `nextSequentialId` interpolates the id stem into a RegExp unescaped; no OPTIONS/CORS handling on `/api/proposals` (deliberate? comment it); the claims route's 404-JSON branch is dead under static export (host 404s first) — a dev/prod contract fork, document it. Also: no duplicate-relation refusal — a re-submitted `(from,to,kind)` mints a fresh edge id and opens a PR the human must catch. |

### E-III. Loader, scripts, styling, metadata

| # | Sev | Where | Defect |
|---|-----|-------|--------|
| E16 | LOW | `loader.ts:81,96,103,114` | Only `listDomains()` sorts; claims/forecasts/dossiers load in raw `readdirSync` order — `/api/graph` arrays aren't reproducible across filesystems (noisy diffs, unstable first-ref-wins attribution). Fix: sort every listing. |
| E17 | LOW | `scripts/forecasters/ensemble-predict.ts:265-267` | `--update` writes the forecast file with **no schema validation and a whole-file re-stringify** — a model-fabricated non-URL source lands in `data/` and only explodes at the next build; the rewrite clobbers the diff-preserving folding the Worker path carefully implements in `serialize.ts`. Fix: `Forecast.parse` before write; reuse `appendPredictionToForecast`. |
| E18 | ~~LOW~~ **CLOSED s64** | `mcp-server/src/http.ts:10` | Default `ABOARD_API_BASE_URL` is `http://localhost:3000`, where `next dev` serves **no** `/api/proposals` (it's Worker-only) — default-config writes fail with a misleading 404. Fixed: the default is the production origin, where every tool works; local reads set the env var. |
| E19 | LOW | `src/app/globals.css:66-131,232-239,353-360` | The full dark-token set is duplicated verbatim between `:root[data-theme="dark"]` and the `prefers-color-scheme` block (same for the toggle glyph and RF colorMode rules) — the same duplication-drift class as the enum/hex findings, CSS-side: edit one block, silently fork the palette between toggle-dark and system-dark users. Fix: shared indirection layer, or a diff-match check. |
| E20 | LOW | `globals.css:1,129-142,163-168` | Tailwind is imported but **zero utility classes are used anywhere** — all styling is hand-rolled `ag-*`/semantic classes; the `@theme inline` alias block and `header.top.fixed` are dead. Either adopt utilities or drop the dependency (and fix CLAUDE.md's "Tailwind v4 + design tokens" description). |
| E21 | LOW | `src/app/**` | **Half closed, verified session 58.** Closed: robots and sitemap both shipped — `public/robots.txt` is a deliberate static file carrying the allow stance and Content Signals (its header explains why static: Cloudflare's managed robots.txt is disabled for the zone so nothing overrides it), and `src/app/sitemap.ts` exists. Still open: no `alternates.canonical` anywhere (`claims/[id]/page.tsx:42` uses `alternates` but only for `types`, pointing at the JSON-LD and Markdown twins), and `/graph` still exports no metadata at all. `CANONICAL_ORIGIN` already exists — wire it into canonicals. (Positive: all three OG generators correctly export `alt`/`size`/`contentType` + `force-static`, with `generateStaticParams`.) |

### Verified-fine (so nobody re-audits them)

Duplicate ids across domains ARE caught; edge endpoints, forecast/dossier
attachments, and orphaned analyses ARE integrity-checked; both API routes are
correctly `force-static` with `generateStaticParams`; `public/_headers`
restores the Content-Type/CORS that export drops; built `out/api/*` validates
against `v0.json` (ran Ajv directly); no data file has out-of-schema keys; no
`headers()`/`cookies()`/hydration-hazard dates anywhere; `withinRateLimit` is
race-free and covered; `providers.local.json` is gitignored with no secrets.

## Sequencing (batches 1, 2 and 3 shipped; every batch branches off `main`)

Batches are ordered by user-visible value over effort; each lists its
acceptance gate. A1, the only *live production* defect, shipped in batch 1.

1. ~~**Hotfix PR**~~ **SHIPPED.** A1, A2, and both forbidden-string gates
   (`canonical-urls.test.ts` on source, `check-built-urls.mjs` on built
   output). Verified green again in the current status block.
2. ~~**Graph-state integrity PR**~~ **SHIPPED** as `fix/graph-state-integrity`
   (recorded in `knowledge/issues.md`): E1, E2, E3, E4 and `graph/error.tsx`.
   Verified again in the current status block. Note E5 was not in this batch
   and is still live,
   so the graph's keyboard surface remains ungated.
3. ~~**Type-layer honesty PR**~~ **SHIPPED**, across sessions 49 and 50. A4
   and the enum-sync test in 49; A3, `z.strictObject`, the schema-drift test and
   the forecast port in 50. Both acceptance criteria met, and A3 was fixed with
   a pattern copied from `v0.json` rather than the `z.iso.datetime()` this entry
   proposed, which would have rejected all twelve date-only `resolutionDate`
   values. Two extra defects surfaced from fault-testing: the loader named the
   wrong file on a parse failure, and the two write doors had come to disagree
   about unknown keys.
4. **Write-path robustness — mostly SHIPPED (session 47).** A6, A7, A8, A9,
   A5 and E11 all landed, with the pure helpers extracted to `src/lib/pr-body.ts`
   so the Worker's decisions are unit-tested. The acceptance gate is met: the
   forged-provenance fixture renders inert. Still open in this batch: E13
   (orphaned branch cleanup), E15 (the one-liners and duplicate-relation
   refusal), E14, and the remainder of E10 after session 51 downgraded it: a
   stale *edge* id still fails at CI rather than at submit, and reading ids live
   at `ctx.base` would close the window to zero at the cost of API calls per
   proposal. Both are deliberate deferrals.
5. **Gate-ratchet PR:** `--max-warnings 0` (after the `Claude Design Screens/`
   decision: ignore vs delete), `noUncheckedIndexedAccess` (48-error budget,
   probed), coverage thresholds, dependency gate, `z.toJSONSchema` semantic
   check. The `clients/` and `mcp-server` type-checks landed in session 48. Add
   the gap session 48 named and nobody has closed: `code_globs` has no reader
   for config, so `ci.yml` and `wrangler.jsonc` go unchecked. Flip each to
   blocking only when green.
6. **Refactor PRs (one each, browser-QA'd):** `ClaimGraphRF` split (now 1139
   lines and still growing, 9 extractable units), `tokens.ts` extraction,
   hover/connection perf (corrected targets in D), the `claims/[id]/page.tsx`
   split, E12 exporter append-semantics, E16-E21 cleanups. `vocab.ts` and the
   docs de-stale are done.

Cross-cutting rule for every batch: if a fix has a matching C-gate, the gate
lands in the same PR as the fix — a fix without its regression net is half a
fix.
