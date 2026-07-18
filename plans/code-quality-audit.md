# Code-quality audit — 2026-07-18

A read-only, seven-agent audit of aboard's stack against current (2026) best
practices. Each agent researched its technology and audited the actual code;
findings are file:line-anchored and flagged **automatable** (a check that
prevents recurrence) vs **manual** (a refactor needing judgment). Raw per-domain
reports are archived with the session; this is the consolidated, deduplicated
plan.

Stack audited: Next.js 16.2.6 (App Router, `output:"export"`), React 19.2.4,
@xyflow/react 12.10.2, TypeScript strict, Zod 4, Tailwind v4, the Cloudflare
Worker write path, the `mcp-server/` package, Vitest.

## Already resolved

- **Write-path rate limiting** — the security agent flagged "no rate limiting" as
  HIGH because it audited `main`; this is **done in PR #46** (per-credential
  `PROPOSAL_LIMITER`, 429 + Retry-After, fails open). The audit's *complementary*
  suggestion stands: add a CI assertion that a `ratelimit`/DO binding exists and
  an integration test that the (N+1)th request 429s.
- **React-hooks lint errors + hard-gate** — done in PR #47.

## A. Real bugs to fix

These are defects, not style. Highest value in the audit.

| # | Sev | Where | Bug | Fix |
|---|-----|-------|-----|-----|
| A1 | HIGH | `src/app/layout.tsx` | No `metadataBase`. Under static export every page emits `og:image`/`twitter:image` against `http://localhost:3000` — **126 occurrences across 32 built pages**. Every social unfurl in production is broken; the three `next/og` generators render but are never shown. Not fixed by `SITE_URL` (that only feeds JSON-LD `@id`s; the Metadata API ignores it). | `metadataBase: new URL(siteBaseUrl())` in root-layout metadata. |
| A2 | HIGH | `claims/[id]/opengraph-image.tsx:176`, `dossiers/[claimId]/opengraph-image.tsx:117`, `graph/jsonld-export.ts:9` | Wrong/dead domain `aboard.dev` baked into OG images (rasterized, so invisible to link checkers) and into the client "Copy JSON-LD" `@context`. Two published representations of the graph disagree on identity IRIs. | Derive from `siteBaseUrl()` / a shared `vocab.ts`. |
| A3 | HIGH | `src/lib/types.ts:7,72,95,127,132,136` | All timestamp fields are `z.string()` with no format; `public/schema/v0.json` requires the ISO regex. The Zod layer is **strictly more permissive than the schema it feeds** — `createdAt:"May 2026"` loads, then serializes to output that fails `v0.json`. Provable drift. | Tighten to `z.string().regex(ISO)`/`.datetime()`; enforce with the drift test (C-checks). |
| A4 | HIGH | render/edit path | The 4th edge kind **`evidences`** is in `types.ts`/`v0.json` but dropped from `engine-adapter.ts:15` (`SUPPORTED_EDGE_KINDS`), `global.d.ts:45` (`EngineEdge.kind`), `EdgeEditorModal.tsx:43-45` (3 options), `ClaimEdge.tsx:16-26` (STROKE/DASH). An `evidences` edge is unrenderable/uneditable. Live drift from enum duplication. | Derive from `EdgeKind.options`; enum-sync test (C). |
| A5 | MED | `types.ts:37` + `mcp-server/.../write.ts:29` | `z.string().url()` accepts `javascript:`, `data:`, `vbscript:` (verified). Violates "sources must be real landing-page URLs"; stored-XSS-shaped once rendered as `<a href>`. | Constrain `Source.url` to `http(s)` only. |
| A6 | MED | `worker/index.ts:324-449` | Caller-controlled `rationale`/`statement`/`sources[].label` are interpolated **unescaped** into the reviewer-facing PR body. A malicious agent can forge a second `## Provenance` block, pre-tick the `- [x]` checklist, or embed a tracking pixel — on the exact surface the human trusts to gate the merge. | Escape/fence caller Markdown; keep the machine-stamped provenance unforgeable. |
| A7 | MED | `worker/index.ts` | No `.max()` on any payload string/array + `request.json()` buffers the whole body → one authenticated request can commit an arbitrarily large blob / PR. | `.max()` bounds on every user string/array; reject oversized `content-length` before parsing. |
| A8 | MED | `worker/index.ts:116,201,747` | Network/JSON errors throw uncaught — no top-level try/catch, `readGraph`'s `res.json()` unguarded, `gh()`'s `fetch()` unwrapped. A DNS error or non-JSON graph becomes a bare Cloudflare 500, defeating the structured-error contract agents rely on. | Wrap handler → structured 500; guard `readGraph` (→503); wrap GitHub fetch (→502). |
| A9 | MED | `worker/index.ts:82` | `JSON.parse(ABOARD_AGENT_TOKENS) as Record<…>` — no validation. A malformed entry yields `undefined` `operator`/`agentId` that get **stamped into provenance** (violates "never strip attribution"). | `z.record(TokenIdentity).safeParse` and refuse on failure. |

## B. Hardcode & duplication (the flagged concern, quantified)

The hunch was right, and it is mostly **duplicated vocabularies and re-typed
tokens**, not loose numbers. Ranked by drift risk:

- **[HIGH] Enum duplication → live `evidences` drift (A4).** `ClaimKind`/`EdgeKind`
  re-declared in ≥7 places (`mcp-server` ×2, `global.d.ts`, `engine-adapter.ts`,
  `EdgeEditorModal.tsx`, `ClaimEdge.tsx`). Source of truth: `types.ts`.
- **[HIGH] Design-token hex re-typed in the 3 OG images (~30+ literals).** All 9
  kind colors + surfaces hand-copied from `globals.css` into the
  `opengraph-image.tsx` files (Satori can't read CSS vars — legitimate, but should
  pull from one TS palette module, not three hand-copies). Source: a new
  `src/lib/tokens.ts`.
- **[HIGH] Origin/IRI drift (A2).** Canonical origin exists 3×: `site.ts`
  (`CANONICAL_ORIGIN`), `jsonld.ts` vocab IRI, `jsonld-export.ts` (`aboard.dev`).
  Source: `site.ts` + a `vocab.ts`.
- **[HIGH] kind→row and kind→letter maps duplicated with inconsistent keys.**
  `engine-adapter.ts` (`leverage_point`) vs `NodeEditorModal.tsx` (`leverage`);
  `proposals.ts` `KIND_LETTER` vs a `ClaimGraphRF.tsx` ternary that **ignores the
  domain prefix** (client-minted `S1` can collide with server `IS1`/`ECS1`).
- **[MED] Loose graph magic numbers** — `getDefaultNodePosition` `-120/-40`,
  `+96` group pad, fitView `duration/padding`, `minZoom/maxZoom`, popover
  `setTimeout(180)`, edge stroke/opacity. Fold into `LAYOUT`/a `GRAPH_UX` block
  (the existing `LAYOUT`/`HISTORY_LIMIT` are the model).
- **[MED] `COLLAPSED_GROUP_W/H = 220/56` declared twice** (exported from
  `engine-to-rf.ts`, re-declared in `ClaimGraphRF.tsx`).
- **[MED] Repeated literals:** `promptTitle "Agent proposal via /api/proposals"`
  (×3), sentinel authors `agent:reader/v0` etc. (`===` compared in ~7 spots),
  Worker PR-body boilerplate (×4), JSON-LD response headers (×2), `"v0"` (~8).
  Each wants one named source.

## C. Automatable checks to add (prevent recurrence)

Grouped by effort. Each is a gate that fails CI on regression.

**Cheap, high-value (do first):**
- `forecast.test.ts` — pure unit tests for `median`/`spread`/`leaveOneOut`/`simulatedN` (ties, empty/singleton, seed determinism, the F4 reversal). Currently **zero** coverage on the "hero diagnostic".
- Enum-sync vitest test — assert `EdgeKind.options`/`ClaimKind.options` equal every hand-copy. Catches A4 permanently.
- Types↔schema drift test — run `graphLD`/`fullClaimLD` output through Ajv against `v0.json` (reuse `clients/validate.ts` logic) + assert ISO date fields. The missing enforcement of CLAUDE.md's "output validates against v0.json"; catches A3.
- Forbidden-string grep gate — `! grep -rn "aboard\.dev" src/`; ban origin literals outside `site.ts`/`vocab.ts`. Catches A2.
- `clients/` `tsc --noEmit` in CI (currently only transpiled via tsx — the reference adapter can ship a type error).
- `--max-warnings 0` on lint — after ignoring `Claude Design Screens/**` in eslint config and clearing the ~4 real warnings.

**Medium:**
- `jsonld.ts` serializer tests (edge direction, dossier attachment, attribution-never-stripped).
- Worker security unit tests — URL-scheme reject (A5), payload-bound reject (A7), PR-body escaping (A6), error-contract (A8). All runnable under `npm test`.
- tsconfig: `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` (+ `noImplicitOverride`) — highest bug-per-flag ratio for this index-heavy code; enforced by the existing `tsc` gate. Will surface a handful of real errors to fix.
- eslint additions: `@typescript-eslint/no-non-null-assertion` (~15 `!`), `no-magic-numbers` scoped to `graph/**`, `no-restricted-syntax` banning inline `#hex` (allowlist `tokens.ts`) and non-canonical origins, `max-lines` scoped to `src/app/**/page.tsx`.
- `z.strictObject` for data-file schemas so hand-authored frontmatter typos fail loudly instead of being silently stripped.
- Coverage: `@vitest/coverage-v8` + thresholds (start at current, ratchet).
- Dependency gate: `dependency-review-action` + `npm audit --audit-level=high` (×3 lockfiles) — this repo merges agent PRs and the Worker holds a PAT.

**Heavier / later:**
- Worker integration tests via `@cloudflare/vitest-pool-workers` — the single highest-value gap: `readGraph` (fed by real `graphLD` output), auth, routing, error envelopes, base64 round-trip. Every prior prod break was a seam like this.
- Zod→JSON-Schema generation (`z.toJSONSchema`, Zod 4) diffed against `v0.json` — replaces the manual "update the schema" rule.
- typescript-eslint `recommendedTypeChecked` (surfaces every `res.json() as T`) — needs project-service; scope to `src`/`worker`/`clients`/`mcp-server`.
- `eslint-plugin-jsx-a11y` recommended; Prettier/Biome `--check`; split CI into parallel jobs with a concurrency group.

## D. Manual refactors (need judgment; not gates)

- **Split `ClaimGraphRF.tsx` (1101 lines).** Extract `useGraphHistory`, `usePersistence`, `useDomainFilter`, `useBulkActions`, `useNodeEditor`/`useEdgeEditor`. Biggest single readability win; needs browser QA.
- **Split `about/page.tsx` (417) and `claims/[id]/page.tsx` (411)** by section, per the ~250-line page rule.
- **Move `focusId` out of `GraphContext`** into the React Flow store with per-node selectors — hovering a node currently re-renders the whole visible graph (O(N)). Also fix `ClaimNode`'s selector-less `useConnection()`/raw-`transform` `useStore` (re-render every drag/zoom frame).
- **Extract `src/lib/vocab.ts` and `src/lib/tokens.ts`** as the single source for enums, kind→row/letter maps, and the OG palette (drives B).
- **Add a route error boundary** (`src/app/graph/error.tsx`) around the persisted-state graph.
- **Fix stale docs:** CLAUDE.md/README still describe the deleted `public/graph-engine.js` as the live renderer; it's now @xyflow/react.
- **De-duplicate the MCP schemas** (`mcp-server` re-declares payload shapes in Zod v3 while the app is v4) — import from `src/lib` or add the sync test.

## Sequencing

1. **Merge PR #46 and #47 first** — the A5–A9 fixes touch `worker/index.ts`/`types.ts`/`proposals.ts` (in #46) and the C gates touch `eslint.config`/`ci.yml` (in #47); branching code-quality work off the merged `main` avoids conflicts.
2. **Fix-batch PR:** A1–A4 (the four HIGH bugs) + their cheap guard tests (forecast, enum-sync, schema-drift, forbidden-string). Low risk, high value.
3. **Security-batch PR:** A5–A9 + the Worker unit tests.
4. **Gate-batch PR:** tsconfig flags + eslint additions + `--max-warnings 0` + coverage + dependency gate (each verified green before flipping to blocking).
5. **Manual refactors (D):** one PR each, browser-QA'd — the `ClaimGraphRF` split and `vocab.ts`/`tokens.ts` extraction first.
