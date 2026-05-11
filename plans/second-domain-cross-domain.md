# Plan: add a second domain + prove cross-domain works

Add `inequality` as a second domain with a small seed, define ≥1 cross-domain
causal edge to `democratic_backsliding`, verify the loader and UI handle it.

## Context

The cross-domain architecture is in place but untested with real data:
- `data/cross_domain_edges.yaml` exists but is empty.
- `aboard:domains` on `/api/graph` is an array but currently always
  `["democratic_backsliding"]`.
- Schema and loader handle multiple domains; the UI has not been exercised.

Vision decision (2026-05-10) is cross-domain — edges across domain boundaries
are first-class. The `landscape.md` domain ranking puts inequality #2 after
democratic backsliding.

## Goal

By end of session: the live graph shows two domains; clicking a node in
`inequality` opens its claim page; at least one edge crosses domains; the
briefing and JSON-LD endpoints reflect both domains; the UI visually
distinguishes domains.

## Phase 1 — Seed inequality

Add a minimal inequality seed (6–8 claims, ≤4 edges, 1 forecast, 0 dossiers).
Match the established kind structure: symptoms, mechanisms, leverage points.

### Candidate claims

- **Symptoms (2–3):**
  - "Top 1% income share above 1980 peak in major economies" (data: WID)
  - "Intergenerational mobility declining" (data: OECD, Chetty et al.)
- **Mechanisms (3):**
  - "Capital returns systematically exceed labor income growth" (Piketty)
  - "Housing supply constraint compounds wealth divergence" (Hsieh-Moretti,
    Glaeser)
  - "Tax policy capture by concentrated wealth" (Saez, Zucman)
- **Leverage points (2–3):**
  - "Wealth taxation (in some form)"
  - "Housing supply reform / zoning"
  - "Inheritance tax restoration"

Pick real sources: WID (World Inequality Database), OECD inequality dashboard,
Saez-Zucman datasets, IFS, Resolution Foundation. All have stable public URLs.

### Files to create

```
data/inequality/
  claims/
    IS1.md, IS2.md, ...
    IM1.md, IM2.md, IM3.md
    IL1.md, IL2.md, IL3.md
  forecasts/
    IF1.yaml          one forecast attached to (e.g.) IM2 housing-mobility
  edges.yaml          intra-domain causal links
```

Note: keep IDs domain-prefixed (`IS1` not `S4`) to avoid collisions across
domains. Decide if this is a real rule — the schema doesn't enforce per-domain
uniqueness, only global. Either prefix-by-convention or update the schema to
allow `<domain>/<id>` references.

**Decision:** add a `aboard:globallyUnique` clarification to
`research/schema.md`: claim IDs must be globally unique. Prefix new domains'
IDs accordingly.

## Phase 2 — Cross-domain edges

At least one, ideally 2–3, edges in `data/cross_domain_edges.yaml`:

```yaml
- id: CE1
  fromId: IM3          # tax policy capture
  toId: S2             # rising executive aggrandizement
  kind: causes
  strength: 0.45
  rationale: Concentrated wealth captures regulatory and political
    capacity, weakening horizontal accountability institutions.
- id: CE2
  fromId: IM2          # housing supply / wealth divergence
  toId: M3             # economic insecurity drives authoritarian appeal
  kind: causes
  strength: 0.55
```

The point: this is the *honest* model of civilizational systems. Inequality
mechanisms drive democratic-backsliding mechanisms; reduce the former and you
reduce the latter. The graph should make this visible.

## Phase 3 — Loader and schema verification

The loader code should not need changes — it already walks all domain
subdirectories and reads `cross_domain_edges.yaml`. Verify:

1. `npm run dev` boots cleanly.
2. `curl http://localhost:3000/api/graph | jq '.["aboard:domains"]'` returns
   `["democratic_backsliding", "inequality"]` sorted.
3. `clients/validate.ts http://localhost:3000/api/graph` still passes.
4. `clients/briefing.ts` produces a coherent multi-domain briefing. If it
   currently assumes single-domain phrasing, fix the briefing renderer.

## Phase 4 — UI

The current `/graph` page does not visually distinguish domains. Decision
points:

### Option A — Color-coded by domain on top of the kind palette

Keep symptoms red, mechanisms amber, leverage points green; *add* a subtle
left-border or pattern indicating domain. e.g.:
- `democratic_backsliding` → solid border
- `inequality` → double-line border

**Pros:** information-dense, no UI overhead.
**Cons:** the palette gets crowded; small visual cues are easy to miss.

### Option B — Domain switcher / filter chips

Above the graph, three chips: "all domains", "democratic_backsliding",
"inequality". Selecting a domain dims the others. Cross-domain edges are
emphasized when "all domains" is active.

**Pros:** clear, explicit. Pairs with the existing chip aesthetic.
**Cons:** another UI element.

**Recommendation:** Option B for the prototype. Add an `activeDomain: string |
"all"` to `GraphFullbleed`'s state. When set to a specific domain, dim
out-of-domain nodes and edges (reuse the existing `is-active` /
`ag-dimmed` CSS classes from the engine).

### Layout

The current engine places nodes in 3 rows by kind, one column per node within
a row. With two domains, the rows get crowded. Options:
- **Wider canvas.** Scale the canvas width. Simplest. Pan/zoom already works.
- **Cluster by domain within rows.** Same row order, but nodes group by
  domain with subtle spacing. Requires engine layout changes.

**Recommendation:** wider canvas for the prototype. Cluster-by-domain is a
v2 polish.

## Phase 5 — Briefing + adapter

`clients/briefing.ts` may need a small update:
- Section header per domain.
- Add a "Cross-domain edges" subsection listing `CEn` edges with their
  rationales.

`clients/validate.ts` should already pass (schema supports
`aboard:domains` array).

## Verification

1. `data/inequality/` exists with 6–8 claims, 1 forecast, ≥3 edges in
   `edges.yaml`.
2. `data/cross_domain_edges.yaml` has ≥1 real edge.
3. `npm run build` succeeds; loader validates everything.
4. `/api/graph` returns both domains; total claim count = 12 + N.
5. `/graph` shows both domains, optionally filterable; cross-domain edges
   visible.
6. `/claims/IM2` and similar new pages render correctly.
7. `clients/validate.ts` passes against `/api/graph`.
8. `clients/briefing.ts` shows two domain sections + cross-domain edge list.
9. JSON-LD for a cross-domain edge references both `aboard:from` and
   `aboard:to` IRIs without confusion.

## Risks and unknowns

- **ID collisions.** Right now `S1` is only used by democratic backsliding.
  Inequality must use `IS1` (or any non-colliding prefix). Document this rule
  in `CLAUDE.md`'s Rules section.
- **Engine assumes one cluster per row.** With two domains in one row, edge
  routing may become messy. Cross-domain edges may take long visual paths.
  Acceptable for v1; address in a layout pass later.
- **Briefing assumes one-domain framing** in some sentences ("about
  democratic_backsliding..."). Audit the renderer.
- **OG cards** for new claims will work via the existing
  `claims/[id]/opengraph-image.tsx` (it's domain-agnostic).
- **Cross-domain causal claims are inherently more controversial.** "Tax
  policy capture causes executive aggrandizement" is a stronger claim than
  any single-domain edge. Use lower `strength` values (≤0.5) until any
  cross-domain dossiers exist to argue them. Add a `rationale` field on
  every cross-domain edge (the schema already supports it; the seed has
  never set it).

## Out of scope

- A third domain.
- Resolving any cross-domain dossier (we won't have one yet).
- Cross-domain forecasts (a forecast attached to a claim in one domain whose
  resolution depends on data from another) — interesting but separate.
- Updating the graph engine to cluster-by-domain layout.
