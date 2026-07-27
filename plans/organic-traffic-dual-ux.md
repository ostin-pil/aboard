# Plan: organic traffic + dual UX (humans and agents on one surface)

Make aboard discoverable — by search engines, by AI assistants, and by
returning visitors — while keeping one canonical surface that serves humans
and agents equally well. This plan coordinates existing work rather than
replacing it: the hygiene layer is `code-quality-audit.md` (batches 1–2), the
agent-readability layer is `agent-surface.md` (which needs a refresh first —
see §1), and the content cadence is `corpus-growth.md` §3. What is genuinely
new here: Worker content negotiation, the AI-crawler stance, per-claim SEO
surfaces, feeds, the resolution/leaderboard flywheel, and instrumentation.

Thesis: for this product the dominant organic channel is **citation by AI
assistants**, not classic search. aboard's own research
(`research/agent-first-validation.md`, WordLift 2026) says bare JSON-LD
barely moves agent retrieval (d=0.18) while dereferenceable entity pages +
visible link traversal + explicit agent instructions moves it a lot
(d=0.60). Classic SEO still matters as the second channel — claim statements
are literal search queries — and both channels reward the same architecture.

## Status (2026-07-27)

Reconciled against the shipped state; the sections below are kept as
written, with their outcomes noted in place.

- §1 and §3 shipped via the discovery-surface slice
  (`proposed-direction-2026-07.md` slice 1): robots allow-stance, sitemap,
  `llms.txt`, per-claim markdown twins, and the `/about` agents section.
  One §1 item is still open: promoting that section to a full `/agents`
  page, whose stated trigger (the remote MCP endpoint landing) has now
  fired.
- §2 was decided the other way: parallel `.md` URLs shipped instead of
  Worker content negotiation. See the note in §2.
- §4, §5, §6, and §7 are unbuilt and form the open slice of this plan.
  External evidence has since strengthened the §7 case and the thesis
  above: agents overwhelmingly fetch HTML and skip `llms.txt`
  ([Ahrefs via ppc.land](https://ppc.land/llms-txt-adoption-rises-8-8x-but-97-of-files-get-zero-ai-requests/)),
  so the claim page itself is the agent surface.
- Two companion plans now carry adjacent work this plan does not:
  `agent-distribution.md` (registry listings, the dataset export, the one
  launch post) and `proposal-dry-run.md` (the first-proposal funnel).

## 0. Prerequisites (already planned elsewhere; do first)

- **Audit batch 1** — `metadataBase` (A1) + the `aboard.dev` sites (A2). No
  distribution work matters while every social unfurl renders a
  `localhost:3000` image.
- **Audit batch 2** — E1 (landing page must show the canonical board, not the
  visitor's editor sandbox) and E3 (seed versioning: returning visitors
  currently never see content added after their first edit — a quiet
  repeat-traffic killer).
- **`agent-surface.md` §4** — sitemap + robots.txt (also audit E21).

## 1. Refresh and execute `agent-surface.md` (~1 hr refresh, then its ~3–5 hr)

The plan predates the write path going live (session 20) and is stale in our
favor. Update before executing:

- §3: MCP `propose_*` is **live** (Worker `/api/proposals`, rate-limited,
  human-gated) — the agent instructions page should document the real flow,
  not "not yet wired". Promote the `/about` section to a full `/agents` page
  (the plan's own trigger condition for that promotion has fired).
- Claim count (20 → 24 and growing), Vercel reference (deploy is the
  Cloudflare Worker + assets), and the §Decisions base-URL note
  (`siteBaseUrl()` exists now).
- Add §2 addition: per-claim "cite this" affordance — the stable IRI + a
  one-line citation snippet, so an assistant (or a human) copying a claim
  carries the canonical URL with it.

## 2. Content negotiation at the Worker (~half-day)

**Superseded 2026-07-27.** The discovery-surface slice shipped parallel
`.md` URLs (`/claims/{id}/index.md`, Cloudflare's page-markdown
convention) rather than negotiation, and `/about` negotiates
`Accept: text/markdown` at the Worker as a narrower version of this idea.
The remaining value here is incremental (one canonical URL per entity)
and does not justify a second mechanism next to the shipped one. Revisit
only if a real client asks for it.

The Worker already fronts the static assets, so the same canonical URL can
serve both dialects — the cleanest dual-UX primitive available, and one
static export alone cannot do:

- `Accept: application/ld+json` on `/claims/{id}` → the JSON-LD the API
  serves (same bytes as `/api/claims/{id}`).
- `Accept: text/markdown` → a markdown rendering of the claim (statement,
  edges as links, forecast summary, sources) — the llms-full pattern; the
  `clients/briefing.ts` renderer is most of the implementation.
- HTML responses keep the `Link: rel="alternate"` headers from
  `agent-surface.md` §2 so agents that land on HTML can hop without guessing.
- `Vary: Accept` on negotiated routes so caches stay correct.

## 3. AI-crawler stance (~15 min, one decision)

**Shipped.** The repo robots.txt carries the explicit allow stance with the
rationale recorded in-file, and the Cloudflare managed block was disabled
by operator action 2026-07-23.

robots.txt should **explicitly allow** GPTBot, ClaudeBot, PerplexityBot,
CCBot, and peers, and name `llms.txt`. Most sites block them; aboard's
distribution *is* being in retrieval corpora. Record the stance as a comment
in the file so a future session doesn't "harden" it away.

## 4. The claim page as the SEO unit (~half-day)

Claim statements are search queries. Per claim page:

- `<title>` = the claim statement; meta description = current median
  probability + resolution date (differentiated snippets that update as
  forecasts move; regenerated at build, zero runtime cost).
- Sitemap `lastmod` driven by the latest forecast/dossier update for that
  claim — a freshness signal most sites can't produce honestly.
- Put the median + model spread **on** the per-claim OG image (the generator
  already exists; it currently shows only title/kind). People share charts;
  every share becomes a data artifact with the domain on it.
- `alternates.canonical` per page off `siteBaseUrl()` (audit E21).

## 5. Feeds and resolution moments (~half-day + editorial habit)

A static board has no news cycle; manufacture one:

- **Atom + JSON Feed** at `/feed.xml` / `/feed.json`: claim filed, prediction
  added, dossier published, claim resolved. Generated from the loader at
  build (app routes, same pattern as llms.txt). One URL serves humans (RSS
  readers) and agents (JSON Feed) alike.
- **Resolutions are the traffic events.** `corpus-growth.md` §3's
  short-horizon slate (resolve ≤ 2027-03) is what makes them exist soon.
  When one resolves: a short write-up on the claim page (what the models
  said, who was closest, Brier per model) — each is a publishable, linkable
  moment.
- **Model leaderboard page** once ≥1 claim has resolved: which models
  forecast best, updated per resolution — the LMSYS-arena pattern; rankings
  that update earn recurring links. This is the F4 spread story generalized,
  and per the artifact-first rule it is the demo to show *before*
  institutional outreach. (Builds on `open-weights-forecaster.md`; scoring
  fields come from `integrity-foundations.md`.)

## 6. Dual-UX affordances on the human surface (~1 day)

- **"For agents" strip** on every claim/dossier page and the footer: a curl
  one-liner, the MCP config snippet, a link to `/llms.txt` and `/agents`.
  The humans visiting this site are disproportionately agent-builders; the
  strip converts them into API users. (The JSON side already links back:
  `@id` is the human URL.)
- **Narrative entry point on the landing page.** The graph is the hero but
  is opaque cold. One guided chain in prose — claim → edge → dossier →
  forecast — using the both-readings-as-tension framing, with the graph as
  the second click. Keep it to one screen; the graph stays above the fold.
- **Site search** with Pagefind over claims/dossiers — static-export
  friendly, no server, and claim corpora get searched more than browsed.

## 7. Instrumentation (~half-day)

You can't steer what you don't measure:

- Worker: log `/api/*` and negotiated-content hits by user-agent and (for
  writes) token identity — *which agents actually read and write* is the
  product metric. Cloudflare analytics is enough to start.
- Search Console once the sitemap lands.
- Two funnels, reviewed monthly in a session log: human (landing → claim
  page → dossier/graph depth) and agent (`llms.txt` fetch → API fetch →
  first proposal). The agent-UX north star: **time-to-first-successful-
  proposal**, driven down.

## Decisions

- Worker content negotiation vs separate `.md`/`.json` URLs — *recommend
  negotiation* (one canonical URL per entity), with the explicit API routes
  kept as the documented fallback for clients that can't set headers.
  Outcome: parallel URLs shipped instead; recorded in §2 as superseded.
- Leaderboard timing — gate on the first real resolution (needs
  `integrity-foundations.md` fields); don't ship a leaderboard of unresolved
  forecasts.
- Feed granularity — start with the four event types above; per-domain feeds
  only if someone asks.

## Verification

1. Share a claim URL in Slack/X preview tools: real OG image, correct
   domain, probability visible on the card.
2. `curl -H "Accept: application/ld+json" https://…/claims/S1` returns the
   same JSON-LD as `/api/claims/S1`; `text/markdown` returns readable
   markdown; both carry `Vary: Accept`.
3. robots.txt allows the named AI crawlers; sitemap lists every claim with a
   truthful `lastmod`; Search Console accepts it.
4. A feed reader subscribes to `/feed.xml` and shows the latest proposal
   merge.
5. Worker analytics distinguish at least: browser HTML, AI-crawler fetches,
   API reads, authenticated writes.

## Out of scope

- Paid or outbound distribution (newsletters, posting cadence) — this plan
  is the surface, not the campaign.
- Comments/accounts/any social features on the site itself.
- Schema changes beyond what `integrity-foundations.md` already specifies.
