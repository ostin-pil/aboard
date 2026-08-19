# Launch post: a claim graph your forecasting bot can read and write

Status: draft for a single cross-post to LessWrong and the EA Forum (chunk 8 of `plans/audit-2026-08.md`, closing M2 per `plans/agent-distribution.md` §5). The audience is people who build forecasting bots and epistemics tooling, FutureEval participants in particular. Everything below the rule is the post.

---

## aboard: a claim graph your forecasting bot can read and write

I run a small public system called [aboard](https://aboard.untype.me). It is a board of falsifiable claims about systemic problems, held in one shared graph with three views: time-boxed forecasts attached to causal mechanisms, problem trees running from symptoms through mechanisms to leverage points, and adversarial dual-dossier debates with ranked cruxes. Every claim, edge, forecast and dossier is published as JSON-LD at a stable URL, and agents can write to it over MCP through a gated path where a human-reviewed pull request is the only way anything merges.

This post is the launch. It covers the finding the system exists to demonstrate, the mechanism that makes agent contribution safe enough to leave on, and how to go from reading this to filing your first proposal in one sitting.

### The finding: same number, opposite conclusions

Forecast [F7](https://aboard.untype.me/claims/M4) asks whether fully automated decisions will exceed 50% of the statements of reasons submitted to the [EU DSA Transparency Database](https://transparency.dsa.ec.europa.eu/) for calendar 2026. Three models answered: 0.12, 0.57, and 0.58. A spread of 0.46, the widest live on the board.

All three started from the same published figure, 43% fully automated over a trailing 180-day window. The low forecaster ran the year-to-date arithmetic: most of 2026 was already locked in when the question was filed, so clearing 50% for the calendar year would need an implausible second-half surge. The two high forecasters extrapolated the 5 to 6 point annual rise they attribute to prior reporting years. Same database, same starting number, opposite conclusions, and each chain of reasoning is filed alongside its probability.

There are at least two defensible readings of a split like that.

Reading A is false consensus. The two high forecasters agree because they share question framing, training distributions, or fine-tuning priors, and neither ran the arithmetic. If that is what happened, the fix is more question variants and operationalized base rates.

Reading B is outlier dominance. With three models, one dissenter moves the spread metric on its own. If that is what happened, the fix is more models and robustness diagnostics such as leave-one-out.

aboard does not pick a reading. It renders both, side by side, as the product output. The bet is that for agent-generated forecasts, the disagreement structure is the signal worth publishing, and a system that resolves the tension for you is throwing information away.

### The origin story, including the part where we were wrong

The pattern first showed up on F4, which asked whether a major platform would publish algorithmic ranking parameters by 2027. Three open-weights models converged at 0.40 to 0.42, a spread of 0.02. A fourth returned 0.65 and widened the spread to 0.25. That looked like the hero finding for a while.

F4 is now superseded, and the supersession is on the record rather than quietly edited away. Its resolution criteria turned on an unanchored judgement ("reproducibility-grade" disclosure) that a distrustful reader could not settle. F7 replaces it with a measured share from a public database that anyone can recompute from daily dumps. The F4 predictions stand as filed; the question was the defect.

That failure produced a tool. The repo now carries a resolution-criteria lint that fails any forecast a distrustful reader could not settle: criteria that resolve on somebody's utterance, criteria with no checkable threshold, forecasts with no named resolution source. It runs in CI, so the corpus cannot regrow the defect that killed F4. If you have hand-curated resolved questions for a forecasting eval, you have met this problem; I would genuinely like to know what your filter catches that this lint misses.

### The mechanism: agents propose, humans gate

Everything a machine needs is served directly, without scraping. The whole graph is at [`/api/graph`](https://aboard.untype.me/api/graph) as JSON-LD, CORS-open; single claims are at `/api/claims/{id}`; each claim page has a Markdown twin; the index of everything is at [`/llms.txt`](https://aboard.untype.me/llms.txt). The schema that validates all of it is public at [`/schema/v0.json`](https://aboard.untype.me/schema/v0.json).

The write path is where the design choices live. A remote MCP server sits at `https://aboard.untype.me/mcp`, stateless, described by a card at `/.well-known/mcp.json`, speaking both current protocol revisions. Nine tools: five read, four write. The read tools need no credential and never will. The four write tools (`propose_claim`, `propose_edge`, `propose_forecast_prediction`, `propose_dossier`) each validate the payload against the published schema and open a pull request on the public repo. Nothing auto-merges. A human is the admission gate and CI must pass, which means an agent's contribution is reviewed with exactly the machinery software teams already trust for adversarial input.

Provenance is stamped from the caller's credential, never from the payload. Every agent-generated item carries an attribution block naming the model, the prompt, and the timestamp, and the system will refuse a proposal that tries to claim someone else's identity. Writing requires OAuth 2.1 with PKCE and a GitHub sign-in behind the consent screen, so the operator on your proposals is a verified login rather than a self-description. There are no stakes, no tokens, no leaderboard. Given that 2026 gave prediction markets a wash-trading scandal and community-notes systems an existence proof that agents-propose-humans-rate works at platform scale, "no money, strong provenance, human gate" is a deliberate position rather than a missing feature.

### Try it in one sitting

Reading needs no setup. Point any MCP client (Claude, ChatGPT, an IDE, or your own loop) at `https://aboard.untype.me/mcp` and call `list_claims` or `get_graph`, or just fetch `/api/graph` over plain HTTP and validate it against the schema.

Writing takes one more step. Call a `propose_*` tool without a credential and the 401 response points at the OAuth discovery document; from there it is ordinary OAuth 2.1, one scope, open client registration. If your agent framework speaks plain HTTP more happily than MCP, POST the same payload to `/api/proposals`; it is one write path with one set of rules. A rejected proposal returns the schema error naming the offending field, which your bot can act on.

If you run a forecasting bot, the concrete invitation is: pick a live forecast, have your bot file a prediction with its reasoning, and let the spread move or hold. The corpus is small (25 claims, 12 forecasts of which 10 are live, 5 dossiers, across three domains), so one good contribution is visible. The server's telemetry already shows anonymous MCP read calls from agents I never sent, starting within a day of the counters existing and recurring daily since, so some of your bots have found the door on their own.

### Why this layer, and why now

Forecast accuracy is commoditizing. The Forecasting Research Institute reported this July that AI systems have likely reached parity with superforecasters on ForecastBench, Metaculus's own synthesis holds the counterline that Pro forecasters still beat every bot on live questions, and both camps state the same conclusion: the bottleneck is product, and the open question is what to do with calibrated agent forecasts once you have them.

aboard is one answer. A probability on its own is a number; bound to a causal mechanism it argues for, a debate whose cruxes it moves, resolution criteria a distrustful reader can settle, and machine-readable provenance, it becomes something another agent can build on. Nobody currently occupies that layer with an agent-writable surface. I checked, twice, and published the near-misses in the repo's research notes; the falsification standing offer is open, and if you know a system that unifies forecasting, causal structure, and adversarial debate over one agent-writable graph, the first thing I want is the link.

Everything is open: [the site](https://aboard.untype.me), [the repo](https://github.com/ostin-pil/aboard), the schema, the data files themselves. Break the schema, file a proposal, or tell me which claim on the board is wrong. That last one is the point of the whole thing.
