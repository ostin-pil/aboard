# Review capacity, and what agent-driven review could be

Two things that turned out to be the same question. The first is whether a human admission gate survives its own success, which `awesome-mcp-servers` is currently answering in public. The second is whether agents can do the reviewing instead, which a Glama health badge accidentally demonstrated on aboard itself.

Written 2026-08-26. Nothing here is a decision. The measurements are reproducible and the arguments are meant to be argued with.

## The measurement

`punkpeye/awesome-mcp-servers` is a curated Markdown list of MCP servers. Contributing means opening a pull request that adds one line. A maintainer reads it and merges. That is the entire admission process, and it is the same shape as aboard's write path.

Measured 2026-08-26 through the GitHub search API (`repo:punkpeye/awesome-mcp-servers+is:pr+...`):

| Quantity | Value |
| --- | --- |
| Open pull requests | 3,575 |
| Opened in the last 30 days | 1,880 |
| Merged in the last 30 days | 74 |
| Closed without merging in the last 30 days | 68 |
| Last commit to `main` | 2026-08-17 |
| Oldest open pull request | #1508, opened 2025-12-03 |

Arrivals outrun resolutions by roughly thirteen to one. The queue grows about 1,740 a month, and the growth is observable at close range: two days earlier the same query returned 3,437 open, so the backlog gained 138 in 48 hours while the 30-day merge count fell from 96 to 74. `main` has taken no commit in nine days, so the current merge rate is zero and the monthly figure is a decaying average of earlier bursts.

A pull request filed today sits behind 3,575 others. At 74 a month that is roughly four years, and only if the queue were drained in order, which it is not. The oldest open entry has been waiting since December 2025. For anyone submitting, indefinite delay is indistinguishable from rejection, except that rejection would at least be information.

Nothing here suggests bad faith or neglect. One maintainer is doing manual review against sixty-odd submissions a day. The process is working exactly as designed and the design is what fails.

## The fast track that made it worse

`CONTRIBUTING.md` offers an explicit accommodation: an automated agent may append `🤖🤖🤖` to a pull request title to opt into a streamlined merge process.

1,666 of the 3,575 open pull requests carry that marker. Forty-seven percent of the queue is in the fast lane. Of the ten most recently merged, two carried it, which is approximately its share of the queue and therefore no measurable advantage at all.

This is worth naming precisely because the intent was good. A priority signal that any submitter can apply to their own submission conveys no priority, because the equilibrium is that everyone applies it. It is a commons problem in signalling, and the failure is structural rather than a matter of anyone abusing it. Any unpriced marker aboard offers to agents will end up in the same place.

## What this does and does not imply for aboard

It does not imply a present problem. aboard holds 25 claims and has no inbound proposal volume. A queue that never fills never overflows, and the operator's judgement that this state may never arrive is a reasonable read of the base rates for a research prototype.

What it does establish is that the admission gate carries a second property nobody has costed. `CONTRIBUTING.md` argues for it on Sybil-resistance grounds: "Nothing is auto-merged. Every proposal is a pull request that a human reviews, and CI must pass. That is the admission gate, and it is deliberate: it is the only Sybil defence with a long track record." That argument is sound and this document does not dispute it.

Sybil resistance and throughput are independent axes, though, and the gate is only ever defended on the first. `awesome-mcp-servers` demonstrates a design whose Sybil defence held perfectly while its throughput went to zero. Nothing hostile got in. Nothing got in.

The trigger is success rather than attack, which is the part worth internalising. The load that breaks a human gate is indistinguishable from the outcome the project is working toward. If chunk 8's launch post achieves what it is written to achieve, the resulting volume is the failure condition. And the numbers required are small: one motivated agent operator, acting entirely in good faith, can file more well-formed proposals in a day than a solo maintainer reviews in a month.

So this is a latent property, not a defect, and the right response now is to have costed it rather than to build for it. Some directions, none of them evaluated:

Tiered review, where the scrutiny a proposal receives depends on what it asserts. A schema-clean edge from a token with a clean history is a different object from a new claim with new sources, and treating them identically is what makes the queue uniform and therefore slow.

Explicit per-token throughput limits, which price the thing the `🤖🤖🤖` marker failed to price. A submitter with a budget self-selects what to spend it on.

A published review SLA with visible queue depth, which does not increase capacity but converts indefinite silence into information a contributor can act on.

An accepted-but-unreviewed tier, published and labelled as such, so the corpus can grow at machine speed while the reviewed subset grows at human speed and the difference is legible to consumers. This is the option most in tension with aboard's thesis and therefore the one worth thinking hardest about.

## The other half: a badge that could not diagnose itself

On 2026-08-23, Glama listed aboard as unhealthy. Its stated candidate causes were that the server is experiencing an outage, that the URL is wrong, or that credentials are missing or invalid.

All three were wrong. The server was up, the URL was correct, and the read tools are deliberately credential-free. The actual cause was `isAllowedOrigin` in `worker/mcp.ts` rejecting any request carrying an `Origin` header, which Glama's checker sends and agent clients generally do not. Finding it took a targeted probe that varied the `Origin` header and exercised `OPTIONS` as well as `POST`, because a preflight refusal is invisible to any tool that only sends the real request. The full account is in `knowledge/issues.md`, 2026-08-23.

The gap that opens up is between a **status** and a **diagnosis**. Glama produced a binary verdict with three generic guesses attached. What the situation needed was a root cause, a reproduction, and a fix, which is a bug report. Every automated check in this ecosystem currently produces the first kind of output.

This is a single incident and it happens to be ours, which is a reason to treat it as an illustration rather than as evidence of a general pattern. It is suggestive rather than conclusive.

## What is already occupied

Any work here has to start by not rebuilding what exists. Glama indexes on the order of 75,000 servers and runs license detection, a security scan and a liveness test during indexing. The official MCP registry performs ownership verification on two independent axes, DNS for the namespace and `mcpName` in `package.json` for the npm name, both of which aboard has now been through. mcp.so, Smithery and PulseMCP are all directory-shaped.

The listing layer is thoroughly served. A fourth list of the same servers has no reason to exist, and the fact that Glama listed aboard with no submission at all, sourcing it from the official registry, shows where the actual distribution graph runs. Directories consume the registry. The registry is upstream of all of them.

## Where the gap is

Everything above is liveness. Is it reachable, does it have a license, does it respond. Those checks are binary, generic, and silent about causes.

What nobody appears to be doing is semantic review, meaning the questions that require reading the server against its own claims:

Does each tool description match its schema, or does the description promise a filter the arguments cannot express?

Does the server do what its README says, checked by calling it rather than by reading the prose?

Is the tool surface prompt-injection-shaped, meaning does it return attacker-influenced text into a model's context without marking it as data?

Does the advertised authorization actually hold, meaning does the write path reject an uncredentialed call rather than merely documenting that it would?

Those are exactly the questions an agent with the server in front of it can answer cheaply and a human curator at zero merges per week cannot answer at all. They are also, notably, the questions whose answers change over time, which makes re-running them valuable in a way a one-time listing decision is not.

## The shape this suggests, which is not a directory

The output of that review is a set of falsifiable, evidenced, re-runnable claims about a server. That is aboard's data model pointed at a different corpus.

The interesting property is the resolution horizon. aboard's forecasts resolve in 2027, and the earliest is 2027-01-31, which is a real obstacle to demonstrating that the methodology works. A claim of the form "server X's `propose_claim` rejects an unauthenticated call" resolves in one HTTP request. Pointing the same machinery at a corpus where verification costs milliseconds gives a working demonstration of evidence, cruxes and adversarial review with a feedback loop measured in seconds.

It also composes with the distribution graph rather than competing with it. A review layer can publish into the existing directories, or alongside the registry, rather than asking anyone to visit a fourth list.

## The smallest convincing proof

Take twenty servers from the official registry. Run an agent review producing per-server findings, each with a reproduction command a reader can run. Show that it surfaces at least one real defect that the existing badges missed.

The aboard incident is already that example end to end, and using it is honest rather than a cherry-pick precisely because the defect is ours: the badge, the three wrong guesses, the probe that found the cause, and the fix that cleared it are all on the record. A proof of concept that leads with a defect in its own author's server is a better argument than one that leads with someone else's.

The failure condition is worth stating in advance. If twenty servers yield no finding that a liveness check would have missed, the gap this document claims exists does not exist, and that is a useful result rather than a disappointing one.

## Two constraints that are not footnotes

The corpus is adversarial in a way aboard's is not. Reviewing MCP servers means executing code and calling endpoints controlled by strangers, and doing it with an agent means that content reaches a model's context. Prompt injection is not a hypothetical risk to the reviewer; it is the threat model of the thing being reviewed. Any design starts with the isolation boundary, and a review agent that can be talked into a favourable finding by the server under review is worse than no review, because it launders the claim.

The second is scope. aboard has an undeployed launch post, an unfiled Search Console verification, and a corpus of 25 claims. A second project is the most reliable way the first one does not ship. If this becomes real it should be a deliberate sequencing decision with the launch post either done or explicitly deprioritised, not something that starts as a quick proof of concept running beside chunk 8.

## Open questions

Whether the registry being upstream of the directories means the individual listings are worth materially less than `plans/distribution-listings.md` assumes, which would also downgrade the awesome-mcp-servers submission from a task to a lottery ticket.

Whether the review corpus should be MCP servers only, or CLIs as well. CLIs are a larger and less served surface with a harder isolation story, since reviewing one means running it.

Whether findings of this kind belong in aboard's schema at all. They are falsifiable claims with evidence, which fits, but they are not claims about systemic problems facing humanity, which is the thesis. Forcing them in would dilute it; a separate corpus sharing the schema and the methodology probably would not.

What the review agent's own accountability looks like. aboard's answer for agent-generated content is `AgentAttribution`, and a review harness needs the equivalent plus something the attribution does not provide, namely a way for a reviewed party to contest a finding.
