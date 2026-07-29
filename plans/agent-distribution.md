# Plan: agent distribution channels

Put the shipped agent surface where agents and their builders actually look.
Slices 1 and 2 built the surface itself: the discovery files, the markdown
twins, the remote MCP endpoint, the server card. This plan is the listing
and outreach work that lets anything find it. It stays inside the project's
standing constraints: consumption is the evidence bar
(`funding-applications.md`), the artifact precedes the outreach, and there
is no recurring posting cadence (`organic-traffic-dual-ux.md` scopes
campaigns out; every item here is a one-off artifact, and each doubles as a
funding evidence item).

## Context: where discovery actually happens

Three external facts, checked 2026-07-27, shape the plan.

- **MCP discovery runs through registries.** The ones that matter beyond the
  official registry: [mcp.so](https://mcp.so) (roughly 20k servers listed),
  [Smithery](https://smithery.ai), [Glama](https://glama.ai/mcp), and the
  [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers)
  list. See the survey at
  [tooldirectory.ai](https://tooldirectory.ai/blog/state-of-mcp-servers-2026)
  and the listing guide at
  [roxyapi.com](https://roxyapi.com/blogs/mcp-registries-where-to-list-your-server).
- **Agents read HTML and skip `llms.txt`.**
  [Ahrefs' server-log study](https://ppc.land/llms-txt-adoption-rises-8-8x-but-97-of-files-get-zero-ai-requests/)
  found 97% of `llms.txt` files received zero AI-bot requests in May 2026,
  while
  [AI agent traffic grew 45% in Q2 2026](https://www.digitalapplied.com/blog/ai-crawler-bot-traffic-statistics-2026-data-reference).
  Keep `llms.txt` (it costs nothing and serves IDE agents), expect nothing
  from it; page HTML, the API, and the registries do the actual work. This
  confirms the entity-page bet in `research/agent-first-validation.md` from
  the outside.
- **Forecasting-agent builders congregate at Metaculus's
  [AI Benchmark](https://www.metaculus.com/aib/)** (FutureEval since
  2026-02: three seasons a year, roughly $50k pools, announced on
  [LessWrong](https://www.lesswrong.com/posts/dvGYXZfiqCgcck9im/announcing-spring-2026-ai-forecasting-benchmark)
  and the EA Forum). aboard already rejected competing there
  (`research/reflection-2026-07.md`); the open position is the complement,
  the structured context layer those bots read and write.

## 1. Verify the registry publication (done, session 33)

Session 30 started this flow and never confirmed it finished
(`sessions/2026-07-26_session_30.md`, "What is not verified"). Asserting the
end state rather than re-running the sequence answered all three bullets, and
two of the answers were not what the session expected.

- **The official registry had nothing.** A search for `me.untype/aboard`
  returned zero hits while the same API happily returned other servers, so
  the publish step had never run. The apex TXT record and the P-384 key from
  session 30 were both intact and matched each other, so finishing it needed
  no new credential. `me.untype/aboard` 0.1.0 is now live and points at
  `https://aboard.untype.me/mcp`. `scripts/publish-registry.sh` does the
  whole sequence and re-asserts the end state; `--verify` is the cheap
  re-check, and it is what any future session should run before assuming.
- **The Smithery listing was live all along, and invisible.** It was
  published 2026-07-26 with all nine tools and an empty `configSchema`, so
  the security decision held. Its description was an empty string, and
  Smithery's search is semantic over that description, so the listing matched
  nothing. Four separate queries failed to surface it, which is how it came
  to be recorded as missing. With the description set to the card's line it
  ranks 1st for "aboard" and 3rd for "causal graph forecasts dossiers". The
  lesson generalizes to every registry here: a listing with no description is
  a listing that does not exist, and absence from a semantic search is not
  evidence of absence from the registry.
- **The stray `server.json` is deleted**, and `/server.json` is now ignored.
  Deleting it never depended on publication: `mcp-publisher publish` takes a
  path, so the card at `public/.well-known/mcp.json` can be published where
  it lies and the root copy bought nothing.

Left open, and now testable for the first time. Smithery fronts the server at
`https://aboard--ostin-pil.run.tools` behind its own authorization server
(`auth.smithery.ai`), so gateway traffic carries a Smithery token rather than
ours, and even the public read tools need one. Smithery states it brokers
upstream OAuth per connection, which is the piece session 30 predicted we
would not get and session 31's OAuth work makes possible. The `ostin-pil`
namespace holds no connection yet, so nothing has exercised it: a Smithery
API key plus one Connect API grant against our authorization server would
settle whether a `propose_*` call arrives authenticated.

## 2. The remaining listings (operator, ~1 hr)

- Submit to Glama and mcp.so with the endpoint URL and the server card.
- Open a PR against `punkpeye/awesome-mcp-servers` under the appropriate
  category (knowledge, or research and data).
- Every listing links `/about` (or `/agents` once promoted) so a builder
  lands on instructions, never on a bare endpoint.

## 3. Reliability as a stated feature (~30 min, writing only)

The 2026-07 sweep recorded that around half of public remote MCP endpoints
are dead (`research/reflection-2026-07.md`), so plain reliability
differentiates. State it where builders read: the agents surface and the
listing descriptions name the stateless design, the dual-era protocol
support, and the absence of any session to lose. An external uptime monitor
with a public status URL is optional; decide at execution time, and skip it
unless a free tier covers it.

## 4. The corpus as a dataset (~half-day)

`research/agent-first-validation.md` #5 named the pre-curated
falsifiable-claims corpus as a product for LLM-forecasting researchers, who
currently hand-filter about 90% of platform questions. Distribute it where
that audience shops:

- `scripts/export-dataset.ts` renders the graph (claims, edges, forecasts,
  dossiers, full attribution) to JSONL plus a README, from the loader, so
  the export can never drift from `data/`.
- Publish as a versioned dataset on
  [Hugging Face](https://huggingface.co/datasets), license matching the
  repo, README pointing back at the API and `/mcp` as the live versions of
  the same records.
- Refresh per release, or per session that grows the corpus; the version
  string is the commit hash.

This is the artifact that makes the external-consumer conversation concrete:
"use the dataset" is an easier first yes than "integrate the API", and every
download is countable evidence.

## 5. One launch post (writing-led, ~half-day, after OAuth lands)

A single cross-post to LessWrong and the EA Forum, pitched at the FutureEval
bot-builder audience: a claim graph your forecasting bot can read, and write
to over MCP, with human-gated PRs as the only merge path. Lead with the F4
spread story (the methodology-first framing the project already uses), link
the dataset from §4 and the agents surface, and show the connect-and-propose
flow end to end.

It waits for OAuth deliberately: the post should let a reader go from
reading to a first proposal in one sitting, and a static bearer token no
reader holds cannot do that. Timing target: after the OAuth slice merges and
before the next FutureEval season opens, so the audience is looking for
tooling. This is the sanctioned one-off artifact, and it serves the funding
checklist's "one citation or mention" item.

## Verification

1. Searching the official registry, Smithery, Glama, and mcp.so each
   returns the server, pointing at the canonical endpoint.
2. The dataset downloads, and a spot check validates records against
   `public/schema/v0.json`.
3. The post is live; Worker analytics show referred agent reads in the days
   after (requires `organic-traffic-dual-ux.md` §7 instrumentation, which
   should land first for exactly this reason).
4. `funding-applications.md`'s evidence package gains two checkable items:
   the dataset as a consumable artifact, the post as a citable mention.

## Decisions

- **Dataset home.** Hugging Face over GitHub releases; recommendation is
  Hugging Face, because the target audience discovers datasets there and
  download counts are public evidence.
- **Status monitoring.** Defer unless free; the stated reliability posture
  in §3 does not depend on it.
- **Post timing.** Gate on OAuth merging, aim before the next FutureEval
  season announcement.

## Out of scope

- Competing in FutureEval or any accuracy benchmark
  (`research/reflection-2026-07.md` records the rejection).
- Newsletters, posting cadence, paid distribution of any kind.
- Registry entries for the stdio `mcp-server/` package beyond what the
  official registry entry already carries; the remote endpoint is the
  product.
