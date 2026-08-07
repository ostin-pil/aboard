@AGENTS.md

# aboard

An agent-first board of falsifiable claims about systemic problems facing humanity. Three modules over a shared claim graph: predictions (time-boxed forecasts), problem trees (symptom → mechanism → leverage point), and adversarial debates (steel-manned dual-dossier with ranked cruxes). Every claim is published as machine-readable JSON-LD by default.

## Run

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # production build (full type-check)
npx tsc --noEmit     # type-check only, faster
npm run lint         # eslint
npm run test         # vitest
npm run lint:resolution   # forecast resolution-criteria rigor; session-end gates on --strict
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
- `public/graph-engine.js` — vanilla JS interactive graph engine, mounted via `ClaimGraphCanvas.tsx`.
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
  cross_domain_edges.yaml               (empty in v0; reserved for cross-domain)

public/schema/v0.json                   JSON Schema validating the JSON-LD API
public/graph-engine.js                  client-side interactive graph

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
    ClaimGraphCanvas.tsx                React wrapper around graph-engine
    GraphFullbleed.tsx                  fullbleed page chrome + toolbar
    ThemeToggle.tsx                     system/light/dark
  lib/
    data/loader.ts                      walks data/, validates with Zod
    graph.ts                            accessor layer
    types.ts                            Zod schemas + TS types
    jsonld.ts                           JSON-LD serializers
    engine-adapter.ts                   ClaimGraph → engine data shape

clients/                                independent npm package
  validate.ts                           validates /api/graph against v0 schema
  briefing.ts                           renders Markdown briefing from API
  package.json, tsconfig.json
scripts/
  generate-prediction.ts                live agent forecast generator
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
- `docs` — documentation, session logs, research
- `chore` — config, scripts, tooling, dependencies

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
