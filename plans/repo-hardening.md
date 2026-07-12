# Plan: repo hardening — LICENSE, CI, referential integrity, real namespace

The cheap items that are silently blocking every adoption and funding story:
the repo has no LICENSE (reuse terms undefined — fatal for a
substrate-adoption thesis), no CI (contributed data has no automated gate),
no referential-integrity checks (dangling references load silently), and the
JSON-LD vocab still points at the placeholder `https://aboard.example/vocab/`.
Effort: ~3–4 hr total; each step is an independent commit.

## 1. LICENSE (do first — pulled forward by `flf-epistack-entry.md`)

Dual-license, stated in a root `LICENSE` + a "Licensing" section in README:

- **Code: Apache-2.0** (recommended over MIT for the explicit patent grant —
  the right posture for would-be infrastructure). 
- **Data (`data/`, `public/schema/`): CC BY 4.0** — attribution-preserving
  reuse is exactly the `AgentAttribution` ethos; BY (not BY-SA) keeps agent
  ingestion friction-free.

Decision to confirm with the maintainer: Apache-2.0 vs MIT (both defensible;
pick one, don't bikeshed), and whether the schema file counts as code (treat
as CC BY 4.0 with the data — it's a published contract).

## 2. CI — `.github/workflows/ci.yml`

On push + PR: `npm ci` → `npx tsc --noEmit` → `npm run lint` → `npm run build`
→ start the built app → `clients/validate.ts http://localhost:3000/api/graph`
(and one `/api/claims/<id>`) → kill. Add the resolution-criteria lint
(`scripts/lint-resolution.ts`) as a step once `integrity-foundations.md`
lands (warn-only until F1–F5 pass, per that plan).

Notes: `clients/` has its own `package.json` — `npm ci` there too, or invoke
via `npx tsx` with the root toolchain (check which its imports allow). The
build already exercises the Zod loader, so malformed `data/` fails CI by
construction — that's the gate the MCP write path (`mcp-write-path.md`)
depends on. This is a prereq for that plan.

## 3. Referential integrity in the loader

`src/lib/data/loader.ts`, after all parses, before returning the graph —
collect claim IDs, then **throw with file context** (same failure style as the
Zod errors) on:

- `edge.fromId` / `edge.toId` not in the claim set (all 22 edges: 12 + 7 + 3
  cross-domain);
- `forecast.attachedToClaimId` / `dossier.attachedToClaimId` unknown;
- `claim.analyses[]` referencing a missing analysis id, and orphaned analyses;
- duplicate IDs across domains (IDs are globally unique per CLAUDE.md — today
  this is convention, not code).

Also close two soft holes while in the file: `loadEdges` silently returns `[]`
on a non-array file (make it throw), and `domain` is free-form
(`z.string()`) — validate claims' `domain` against the set of directories
actually present under `data/` rather than hardcoding an enum.

## 4. Real vocab namespace + placeholder sweep

Once the Vercel deploy from `flf-epistack-entry.md` fixes a real domain:
replace `https://aboard.example/vocab/` in `src/lib/jsonld.ts` (+
`public/schema/v0.json`, `research/schema.md`, same commit per CLAUDE.md),
and sweep the `// PLACEHOLDER: revise after audience decision` comments in
the OG-image/detail routes — the audience decision was made in `vision.md`
(both, human + agent); either implement what they defer or delete them.

Blocked on: domain choice. Everything else in this plan is unblocked.

## Verification

1. CI green on a no-op PR; CI **red** on a deliberate fixture PR containing a
   dangling `edge.toId` (add, confirm, remove).
2. `npm run build` locally still passes after the loader tightening — i.e.,
   current data is actually clean (the audit says it is; the check makes it
   stay that way).
3. GitHub shows the license; `/api/graph` output unchanged except namespace.

## Out of scope

- Unit tests for `src/lib/` (worthwhile — `forecast.ts` and the loader are the
  natural first targets — but a separate decision; CI above gates on the
  type-check + build + API contract, which covers the current risk surface).
- Deployment config itself (lives with the FLF plan's Day-1 deploy).
