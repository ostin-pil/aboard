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
```

## Architecture

- `src/data/seed.ts` is the source of truth for the claim graph (no DB yet — JSON-as-data).
- `src/lib/types.ts` defines Zod schemas + derived TS types. Schema is in flux; pragmatic JSON shape that will become the published JSON-LD context.
- `src/lib/graph.ts` exposes read accessors over the seed.
- `src/lib/jsonld.ts` serializes the graph to JSON-LD with a `schema.org` + `aboard:` context.
- `src/components/ClaimGraphView.tsx` renders the graph with `@xyflow/react`. Nodes laid out manually in three rows by claim kind.
- `src/app/` follows Next.js 16 App Router conventions. Each detail page (`claims/[id]`, `dossiers/[claimId]`) is a server component reading from `graph`.
- `src/app/api/` exposes JSON-LD endpoints — every claim and the full graph at stable URLs.

## Rules

- No `any`. Strict TS only. If a type is unclear, model it explicitly with Zod.
- Every agent-generated content carries an `AgentAttribution` (model + prompt title + timestamp). Never strip attribution.
- Sources must be real URLs. If a claim cites a paper or dataset, the URL goes to the actual landing page, not a fabricated one.
- Don't add a database, ORM, or backing store until the schema stabilizes. JSON-as-source-of-truth is intentional.
- No `console.log` in committed code. Use real logging if needed.
- Keep each `.tsx` page file under ~250 lines — split when larger by responsibility.
- Server components by default. Add `"use client"` only when interactivity demands it.

## File Layout

```
src/
  app/
    page.tsx                       graph view (server component)
    claims/[id]/page.tsx           claim detail
    dossiers/[claimId]/page.tsx    dual-dossier debate
    about/page.tsx                 explainer
    api/claims/[id]/route.ts       single-claim JSON-LD
    api/graph/route.ts             full-graph JSON-LD
    layout.tsx                     header, footer, fonts
    globals.css                    Tailwind v4 + design tokens
  components/
    ClaimGraphView.tsx             React Flow integration ("use client")
    ClaimNode.tsx                  custom claim node
  data/seed.ts                     the seed claim graph
  lib/
    types.ts                       Zod schemas + TS types
    graph.ts                       read accessors
    jsonld.ts                      JSON-LD serializers
scripts/
  generate-prediction.ts           live agent forecast generator
research/                          landscape + gap analysis (the why)
sessions/                          per-session work logs (created by /session-end)
knowledge/                         issues.md and other long-lived notes
```

## Sessions

At the end of a work session, run `/session-end` to finalize: it gates on `npx tsc --noEmit` + `npm run build`, updates today's log in `sessions/`, and commits the log. To start a session with a briefing of where things left off, run `/session-start`. Session logs track what was done, decisions made, files changed, and what's next, so future sessions stay informed without relying on conversation history.

## Commits

Convention: `prefix(topic): short description`

**Prefixes:**
- `feat` — new feature or capability
- `fix` — bug fix
- `docs` — documentation, session logs, research
- `chore` — config, scripts, tooling, dependencies

**Topics:** `claims`, `graph`, `dossier`, `forecast`, `schema`, `jsonld`, `ui`, `data`, `lib`, `scripts`, `research`, `sessions`, `config`, `deps`, `claude`

**Rules:**
- Commits must be atomic — one logical change per commit
- No `Co-Authored-By` trailers
- Message body is optional; use it only when the "why" isn't obvious from the title
- Keep title under 72 characters

## Verification

After any change to `src/`, confirm it type-checks and builds:

```bash
npx tsc --noEmit 2>&1 | tail -10
```
