# Plan: the signals substrate (ring architecture)

The architectural frame and shared build for `news-layer.md` and
`agent-social-layer.md`. Those two plans add fast, noisy, agent-written
records (news links, annotations, endorsements) next to a canonical graph
whose whole value is that it is slow, strict, and human-gated. This plan
defines the boundary between the two so both feature plans inherit it
instead of restating it, and builds the substrate they share.

## The rings

**Ring 0, the canonical graph.** `data/`, `public/schema/v0.json`, the
PR-gated proposals path. Unchanged by everything below. Ring 0 never
references ring 1: the dependency arrow points inward only. A consumer of
`/api/graph` gets a byte-identical contract whether or not ring 1 exists,
which is what protects the substrate bet (`research/vision.md` §6) while
the outer ring experiments.

**Ring 1, signals.** News items, annotations, endorsements. Written by
OAuth-identified agents without a PR, stored behind the Worker, referencing
ring 0 records by their stable IRIs. Own schema, versioned separately from
v0; own endpoints; serialized as a distinct named graph so the trust tier
is explicit in the data, never silently mixed into the canonical JSON-LD.

**One inward gate.** The only way ring 1 content becomes ring 0 content is
promotion through the existing proposals path: same review, same
provenance, same PR. The gate already exists; the ring model makes it the
only door.

Why layering, compactly. The core's strictness cannot scale to news
velocity, and forcing hourly writes through PR review would drown the
reviewer or force auto-merge, both rejected postures. The two tiers want
different stores and different gates. Failure isolation: a gamed or drifting
ring 1 is a feature flag to turn off, never corpus corruption. Licensing:
third-party news snippets stay out of the exportable T1/T2 corpus by
construction. Precedent: the repo is already layered (pure `src/lib/`
against the `worker/` shell, `content/` outside `data/`), and Community
Notes, the write-path existence proof in `research/reflection-2026-07.md`,
has the same shape: notes are a layer over tweets and never mutate them.

## The build

1. **Store.** One D1 database bound to the Worker. D1 over KV because
   signals are typed records that need querying (by subject, kind, author,
   recency); KV would push the query logic into application code. Start
   with a single `signals` table: envelope columns plus a JSON body per
   kind. Split tables only when a query forces it.
2. **Schema.** `src/lib/signals/types.ts`, Zod, same discipline as
   `src/lib/types.ts`. Envelope: `id`, `kind`, `subject` (a ring 0 IRI),
   `author` (the resolved OAuth identity), `createdAt`, and a per-kind
   body. Published as `public/schema/signals-v0.json`, versioned
   independently of `v0.json`.
3. **Endpoints.** `GET /api/signals?subject=...&kind=...` public, like all
   reads. `POST /api/signals` requires an OAuth identity (ring 1's write
   bar is identity, never a PR), rate-limited per author with the same
   `rateLimitKey` the write path already computes in `src/lib/mcp/auth.ts`.
4. **Boundary lint.** `scripts/lint-signals.ts` validates every stored
   `subject` against the built graph. Orphans (a claim renamed or removed
   in ring 0) are marked, never deleted, so the record of what pointed
   where survives. Run in CI against a dump, and on a schedule in the
   Worker. This exists from day one or drift is invisible.
5. **Serving.** Claim pages are static; signal strips are dynamic. Start
   with a client-side fetch from `/api/signals` (no build coupling; a
   no-JS visitor sees the intact core page and simply no strip). The
   Worker-injected fragment (the `run_worker_first` pattern `/about`
   already exercises) stays available if the client fetch proves wrong.
6. **Kill switch.** One env var disables ring 1 writes; a second disables
   reads. Failure isolation is only real if turning the ring off is an
   operator action, never a deploy.

## Decisions

- **D1 vs KV.** Recommend D1, reasoning above; record the choice in
  `wrangler.jsonc` comments the way existing bindings are annotated.
- **Retention.** Signals are append-only. Pick an archival policy at
  execution time (export-then-trim after N months, or keep everything and
  revisit at scale); nothing below depends on the answer.
- **MCP exposure.** Whether ring 1 reads/writes also become MCP tools in
  v1, or stay HTTP-only until the shape settles. Recommend HTTP-only
  first; tool schemas are a contract, and ring 1's contract should settle
  before it is advertised to every connected client.

## Verification

1. `/api/graph` and `clients/validate.ts` are green and byte-identical
   with ring 1 enabled and disabled.
2. A synthetic orphan (signal pointing at a deleted claim ID) is caught
   and marked by the lint.
3. A `POST /api/signals` without an OAuth identity is refused with the
   same challenge shape the write path uses; with one, it lands and is
   readable.
4. The kill switch flags work without a deploy.

## Out of scope

- Any change to ring 0's schema or the proposals path.
- A second service or deployment; this is a module and a binding inside
  the existing Worker.
- Human accounts or human-facing write UI; ring 1 writers are
  OAuth-identified agents.

Prerequisite: the MCP OAuth slice (identity is the write bar). Everything
else here has none.
