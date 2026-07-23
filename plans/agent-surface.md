# Plan: agent surface — llms.txt, navigable entity pages, agent instructions

> **Status: SHIPPED as slice 1 of `plans/proposed-direction-2026-07.md`**
> (branch `feat/discovery-surface`). What landed and where it deviates:
>
> - §1 `llms.txt` — done, generated route `src/app/llms.txt/route.ts`.
> - §2 entity-page nav + embedded JSON-LD — already shipped pre-slice; added
>   `rel="alternate"` discovery via the claim page's `generateMetadata`
>   `alternates.types` (`application/ld+json` **and** `text/markdown`) rather
>   than the `Link` response header this plan named — an HTML `<link>` is
>   guaranteed under static export, where per-page response headers are not.
> - §3 agent instructions — done as a `## For agents` section on `/about`
>   (not a separate `/agents` route yet), plus fixing the stale "not yet
>   shipped" copy. Promote to `/agents` when the remote MCP lands (slice 2).
> - §4 crawl affordances — `public/robots.txt` (allow-all: search + AI input +
>   training, the decided stance) and `src/app/sitemap.ts` with truthful
>   `lastmod`. The live crawler block was a Cloudflare managed-robots.txt
>   setting, now disabled (operator action, done 2026-07-23).
> - **New, beyond this plan:** per-claim Markdown twins at
>   `/claims/{id}/index.md` (Cloudflare page-Markdown convention).
>
> The body below is the original plan, kept for rationale.

Implement the highest-leverage form of agent-readability per aboard's own
research finding (`research/agent-first-validation.md`, WordLift 2026): bare
JSON-LD markup barely moves agent retrieval (d=0.18); **dereferenceable
entity pages + visible linked navigation + explicit agent instructions +
multi-hop traversal** is where the payoff is (+29.6%, d=0.60). aboard
currently ships the low-leverage form: a JSON-LD API with no llms.txt, no
served onboarding surface, and claim pages whose cross-links need an audit.
Effort: ~3–5 hr.

## 1. `llms.txt`

An app route (`src/app/llms.txt/route.ts`) rather than a static file, so the
index stays generated from the loader and can't drift. Contents:

- One-paragraph description (reuse the README framing) + license line.
- The API surface: `/api/graph`, `/api/claims/{id}`, schema at
  `/schema/v0.json`, content type `application/ld+json`, CORS open.
- A generated index: every claim as `- [{id}: {title}]({absolute-claim-url})`
  grouped by domain; forecasts and dossiers listed under their claims.
- Pointer to the agent-instructions page (§3) and the MCP server package.

## 2. Entity-page navigation audit (`/claims/[id]`)

The WordLift result hinges on link traversal. Verify — and add where missing —
that every claim page renders as **links, not just data**:

- incoming and outgoing edges → anchor links to the neighbor claims, with the
  edge kind + rationale visible;
- attached forecast and dossier → links to their surfaces;
- cross-domain neighbors clearly marked (they exist: CE1–CE3);
- every source → its real external URL (already enforced by schema).

Add per-page embedded JSON-LD (`<script type="application/ld+json">` with the
existing `fullClaimLD`) and a `Link: <…>; rel="alternate";
type="application/ld+json"` response header so an agent landing on the HTML
can hop to the structured form without guessing the API shape.

## 3. Agent instructions page

A served page (`/agents` or an `## For agents` section on `/about`) that says,
in imperative prose: how to read (API + schema + llms.txt), how to verify
(fetch `/schema/v0.json`, validate like `clients/validate.ts`), how to
contribute today (PR-pack flow per CONTRIBUTING.md), and how contribution will
work (MCP `propose_*` — mark as not yet wired, honestly). This is the served
version of `research/agent-onboarding.md`'s intent; keep it short and factual.

## 4. Crawl affordances

`src/app/sitemap.ts` (claims, dossiers, static pages) and a permissive
`robots.txt` that names `llms.txt`. Cheap, standard, and part of the
"dereferenceable" story.

## Decisions

- `/agents` page vs `/about` section — *recommend `/about` section now* (one
  fewer surface to keep honest), promote to `/agents` when MCP write lands.
- Absolute URLs need the canonical domain — coordinate with the Vercel deploy
  (`flf-epistack-entry.md` Day 1) and the namespace fix (`repo-hardening.md`
  §4). Use an env-derived base URL helper, not hardcoded strings.

## Verification

1. `curl /llms.txt` lists all 20 claims with resolving absolute URLs.
2. From any claim page, an agent (or a human) can reach every graph neighbor,
   its forecast, and its dossier by following visible links — test the
   longest chain: inequality claim → cross-domain edge → backsliding claim →
   dossier M4.
3. Claim HTML contains embedded JSON-LD that matches `/api/claims/{id}`.
4. `npx tsc --noEmit` + `npm run build`; pages stay server components
   (CLAUDE.md rule) — nothing here needs `"use client"`.

## Out of scope

- MCP registry publication (belongs to `mcp-write-path.md` when write lands).
- Any redesign of the claim page beyond links + embedded JSON-LD.
