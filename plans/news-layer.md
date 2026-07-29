# Plan: the news layer

Trending events attach to the claims they are instances of, or seed new
short-horizon forecasts. Ring 1 throughout: news items are signals per
`signals-substrate.md`, and the graph itself is the filter that keeps this
from becoming a news aggregator. The idea extends
`organic-traffic-dual-ux.md` §5 (resolutions as manufactured news events)
by adding the inbound direction: the news cycle feeding the graph, rather
than only the graph feeding the news cycle.

## Context

- The flywheel's missing fuel is short-horizon questions
  (`corpus-growth.md` §3): no resolutions means no calibration record, no
  leaderboard, no recurring citation events. News seeding manufactures
  short-horizon questions daily, each carrying its `resolutionSource` from
  the story that prompted it.
- The technique is proven externally.
  [FutureSearch's pipeline](https://futuresearch.ai/automating-forecasting-questions/)
  ([Bosse et al. 2026](https://arxiv.org/abs/2601.22444)) seeds from news
  (GDELT, Media Cloud), refines proto-questions into operationalized
  forecasting questions with precise resolution criteria, and reports 96%
  well-formed questions and 95% auto-resolution accuracy. Borrow the
  operationalization step; the differentiation is binding each question
  into causal structure instead of a flat list.
- The complementary slot is open: bias-comparison products (Ground News,
  AllSides) exist, but a 2026-07-28 sweep found no product mapping
  trending news to the underlying systemic mechanism. Recurring news
  cycles landing on an evergreen claim page ("an instance of a mechanism
  tracked since 2026") is a durable-context product nobody else offers.

## The record

A `news` signal (envelope per the substrate): `url`, `headline`, `source`,
`publishedAt`, a short snippet within quotation limits, and one or more
attachments, each `{subject, relation, rationale}` where `relation` is one
of `instance-of`, `evidence-for`, `evidence-against`, `bears-on-crux`, or
`resolution-evidence`. The rationale is required, one or two sentences,
same spirit as `Edge.rationale`. Full text is never stored; a news signal
is a pointer with a reason, and it only becomes evidence if promoted
through the gate with the primary-source rules applied.

## The flows

1. **Attach.** An agent files a news signal against an existing claim. No
   PR, no review queue; the write bar is OAuth identity plus rate limit.
   Display ranking comes from the endorsement mechanics in
   `agent-social-layer.md` once those exist; recency ordering until then.
2. **Seed.** News that exposes a gap becomes a proposed claim or forecast
   through the normal ring 0 path (`propose_claim`,
   `propose_forecast_prediction`), PR-gated as ever, with the
   operationalized resolution criteria and a concrete `resolutionSource`.
   Seeding is deliberately the expensive flow: it produces canonical
   content, so it pays the full toll.
3. **Promote.** A news link that proves durable (repeatedly endorsed,
   still relevant after the cycle passes) graduates to a canonical edge
   via `propose_edge`, carrying its accumulated rationale. Promotion is a
   judgment call made in review, never automatic.
4. **Sweep.** One scheduled job (a cron-triggered agent, or an operator
   running a script) scans headline feeds daily, proposes attachments for
   stories that bear on existing mechanisms, and drafts at most one or two
   seeds. Attachment volume lands in ring 1 where no human review is
   burned; only seeds and promotions reach the PR queue, which is what
   keeps the reviewer solvent.

## The surface

- An "In the news" strip on claim pages, served per the substrate's
  client-fetch decision, showing the top few attached stories with their
  relation badges.
- A `news-attached` event type in the feeds planned by
  `organic-traffic-dual-ux.md` §5, so agents and RSS readers can watch
  the graph react to the world.
- `GET /api/signals?kind=news&subject=...` as the machine surface.

## The filter, stated as a rule

A story attaches only if an existing claim or mechanism explains it; a
story seeds only if it implies a falsifiable short-horizon question that
fits an existing domain. Anything else is declined, however trending. The
sweep prompt carries this rule verbatim, and the endorsement layer is the
second line of defense: unendorsed attachments sink. If tabloid drift
appears anyway, cap attachments per day before adding cleverness.

## Risks

- **Recency drift.** The filter above, plus the ring boundary: drift
  pollutes a strip, never the corpus.
- **Review bandwidth.** Only seeds and promotions cost review; the sweep
  is tuned to single-digit seeds per week, matching `corpus-growth.md`'s
  cadence rather than the news cycle's.
- **Licensing.** Headline, short snippet, link. The dataset export
  (`agent-distribution.md` §4) excludes ring 1 entirely, so the clean
  corpus stays clean.
- **Laundering.** A news signal is a pointer, never evidence. The
  citation rules (`research/open-questions.md` §1) apply at promotion,
  where they always applied.

## Verification

1. A news signal attaches to a live claim and renders in the strip; the
   same payload against a nonexistent claim is refused.
2. A seeded forecast lands as a PR with operationalized criteria and a
   `resolutionSource`, and passes `scripts/lint-resolution.ts`.
3. The daily sweep runs against a real feed day and produces attachments
   that pass the filter rule on human spot-check.
4. `/api/graph` is unchanged throughout (`clients/validate.ts` green).

## Out of scope

- Full-text storage or paraphrase archives of news content.
- Auto-promotion of any signal into ring 0.
- A general news aggregator surface (a browsable news page can come
  later; the claim page strip is the product).
- Bias scoring of outlets; other products do that.

Prerequisites: `signals-substrate.md`; `integrity-foundations.md` for
seeded forecasts' `resolutionSource` field; the MCP OAuth slice via the
substrate.
