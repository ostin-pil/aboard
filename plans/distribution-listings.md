# Plan: distribution listings and Search Console

The operator half of audit chunk 7 (`audit-2026-08.md`), covering M3 and
the rest of M4. Session 67 did the mechanical half: `aboard-mcp-server`
is published to npm, both server cards carry a `packages` entry, and the
README, `CONTRIBUTING.md` and `mcp-server/README.md` all point at
`npx aboard-mcp-server`. What is left needs a browser and an account,
which is why it is written down rather than done.

Every submission below is a claim about aboard made to a third party.
Copy the text from the "Canonical copy" section rather than rewriting it
per site, so the four listings say the same thing and a reader who finds
two of them does not have to work out which is current.

## Status

| Item | State |
| --- | --- |
| npm package | **Done.** `aboard-mcp-server@0.1.1` live and carrying `mcpName: me.untype/aboard`, published in session 69. |
| Official MCP registry | **Done.** `me.untype/aboard` serves `0.1.1` with one `packages` entry (`aboard-mcp-server` `0.1.1`) alongside the remote. The `0.1.0` entry remains as history. |
| Glama | Two objects, and they had been conflated. The **connector** at `glama.ai/mcp/connectors/me.untype/aboard` is the unhealthy one; session 72 settled that the `GET`/405 shape is not the cause and that serving anything else on `GET` would be harmful, and claimed ownership via `/.well-known/glama.json`. The **server** listing at `glama.ai/mcp/servers/OWNER/REPO` is a separate, unstarted route that runs a Dockerfile against `mcp-server/`, and it is the one the awesome-mcp-servers badge points at. See `knowledge/issues.md`, 2026-08-26. |
| mcp.so | **Dropped.** No free submission path found; see below. |
| awesome-mcp-servers | **Filed 2026-08-26** as [#12962](https://github.com/punkpeye/awesome-mcp-servers/pull/12962). Do not expect a merge; see section 3. |
| Search Console | **Done 2026-08-27.** `untype.me` verified as a Domain property; `sitemap.xml` submitted. |

Re-verified 2026-08-27 by `npm view aboard-mcp-server`, a `GET` against
`https://registry.modelcontextprotocol.io/v0/servers?search=me.untype/aboard`,
and `dig +short TXT untype.me`.

## 0. The registry re-publish, and the version bump it needs

Read this first, because it is the one item with a decision in it.

The card at `public/.well-known/mcp.json` now has a `packages` entry
naming `aboard-mcp-server` on npm. The copy the registry is serving does
not: it is the card as of 2026-07-29, with `remotes` and nothing else. So
an agent discovering aboard through the official registry today is told
only about the hosted endpoint, and never learns the npx path this
session just built.

Fixing that means running `scripts/publish-registry.sh` again, and the
registry rejects a duplicate version. Session 63 hit exactly this and
recorded it: the publish step "returned the expected duplicate-version
400 with the card version unchanged". So the card's own `version` has to
move before the registry will take it.

That version has five hand-written homes, and `src/lib/mcp/server-card.test.ts`
holds them in agreement. Bumping the card to `0.1.1` therefore means
editing, in one commit:

- `package.json` (root), `version`
- `src/lib/mcp/protocol.ts`, `SERVER_VERSION`
- `public/.well-known/mcp.json`, the top-level `version`
- `public/.well-known/mcp/server-card.json`, the same field

Leave `packages[0].version` at `0.1.0`. It pins the npm package, which
did not change, and `mcp-server/package.json` is the file it must match.
The two version axes are independent on purpose: the card describes a
server whose protocol surface has a version, and it advertises a package
that has its own.

The deploy has to land before the publish, because the script compares
the local card against the served one. Order: bump, merge, wait for the
deploy, then `scripts/publish-registry.sh --verify` to confirm the served
card is the new one, then `scripts/publish-registry.sh`.

**The publish failed on 2026-08-22, and the reason is worth reading before
retrying.** Everything up to the registry's own validation passed: the card
matched production, `mcp-publisher validate` said valid, the DNS record and the
keychain key agreed, and login succeeded. Then:

```
NPM package 'aboard-mcp-server' is missing required 'mcpName' field.
Add this to your package.json: "mcpName": "me.untype/aboard"
```

`mcpName` is the registry's ownership proof for an npm package. It fetches the
tarball's `package.json` and requires that field to equal the card's `name`, so
that nobody can advertise a package they do not control. It has to be in the
*published* package, and npm will not let a version be overwritten, so the fix
costs a second npm release rather than an edit.

The refusal was atomic: the registry entry was still `0.1.0` with no `packages`
array afterwards, checked with `--verify`.

Session 69 does the fix: `mcpName` added, `mcp-server` bumped to `0.1.1`, both
cards' `packages[0].version` following it, and an assertion in
`server-card.test.ts` that pins `mcpName` to the card's `name` so this cannot
be rediscovered at a publish step again. The card's own `version` stays `0.1.1`,
because the registry never accepted it.

Order for the retry: publish `aboard-mcp-server@0.1.1` to npm, merge and deploy
the card change, then run the script.

**Done, session 67.** The bump is committed: `0.1.1` in all four homes
(the lockfile carries the root version twice, so it is five lines rather
than four), with `packages[0].version` left at `0.1.0`. `mcp-publisher
validate` passes against the live registry schema, and `mcp-publisher`
plus the signing key in the keychain are both present on this machine.

What remains is the publish, and it cannot run earlier. The script
fetches `https://aboard.untype.me/.well-known/mcp.json` and refuses to
continue if it differs from the local card, on the grounds that
publishing a card production does not serve would put a lie in the
registry. So the order is fixed:

1. Merge the session PR.
2. Wait for the Cloudflare deploy, then confirm it landed:
   `curl -s https://aboard.untype.me/.well-known/mcp.json | grep version`
   should show `0.1.1`.
3. `scripts/publish-registry.sh --verify` to see the old entry one last
   time (it reports `0.1.0`, remotes only).
4. `scripts/publish-registry.sh` to publish. It re-verifies for up to
   five attempts afterwards, because the registry is read-through
   cached and believing the publish command alone is how session 30
   ended up with an unverified claim.

The keychain prompt in step 4 is the one interactive moment: macOS may
ask to allow `security` to read `mcp-publisher-untype`.

## 1. Glama

<https://glama.ai/mcp/servers>, "Add MCP Server".

Glama indexes from a public GitHub repository, then runs its own checks
(license detection, a security scan, a health test) and enumerates tools
and schemas itself. So the submission is mostly a repository URL, and the
things that make the listing good are already in the repo rather than in
the form.

Repository: `https://github.com/ostin-pil/aboard`

Two things to expect, neither of them a problem to fix in the form:

- The repository root is a Next.js app and the server lives in
  `mcp-server/`. If Glama offers a subdirectory or path field, give it
  `mcp-server`. If it does not, the README link in the canonical copy
  below points a human at the right place.
- Glama's health test launches the server. `npx aboard-mcp-server` starts
  and answers `tools/list` with no credential and no network access to
  aboard, so the check should pass; the five read tools only need the API
  reachable at call time, and the four write tools decline without a
  token rather than erroring.

After it indexes, Glama issues a score badge. The awesome-mcp-servers
entry in section 3 has a slot for it, so do Glama before the PR if you
want the badge in the first version of that line.

**What actually happened, 2026-08-23.** No submission was needed: Glama
had already listed aboard at
<https://glama.ai/mcp/connectors/me.untype/aboard>, sourced from the
official MCP registry. It health-checks the *remote* endpoint rather
than the npm package, and marked it **unhealthy**.

The endpoint was fine. Anonymous `POST initialize` returned 200 and
`tools/list` returned all nine tools. What failed was the origin guard:
Glama sends `Origin: https://glama.ai`, and `isAllowedOrigin` allowed
only same-origin and loopback, so the preflight and the POST both
answered 403. Session 69 removed that check down to well-formedness,
which is all the spec requires, on the grounds that the endpoint is
public, reads no cookie, and gates every write on a bearer credential a
browser will not attach cross-origin. See `knowledge/issues.md`.

**It did not clear.** Glama re-tested 2026-08-26 17:40, after the session
69 deploy, and still reports unhealthy. Session 71 re-probed and found the
endpoint correct on every measure: 200 for `POST initialize` with Glama's
own origin set, 204 for the preflight, all nine tools on `tools/list`, and
clean protocol negotiation across four requested versions.

`wrangler tail` then found a traffic shape nobody had looked at. Of
fourteen requests to `/mcp` in four minutes, twelve were `GET` and one was
`HEAD`, and all thirteen got 405; the single `POST` caller got 200. None
of the thirteen sent an `Origin` at all, which is why the session 69 fix
did not move them. Whether one of them is Glama is unproven, since none
identifies itself, and session 72's research makes it unlikely: the best
evidence is that Glama's probe is a `POST`. `knowledge/issues.md`,
2026-08-26, has the evidence and the decision, which is now settled.

To re-probe the `POST` path, which is the one that works:

```bash
curl -i -X POST https://aboard.untype.me/mcp \
  -H 'Origin: https://glama.ai' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}'
```

A 200 means the endpoint is answering the check correctly and the
remaining fault is on their side.

### The distinction that had been missed (session 72)

Glama has **connectors** and **servers**, and every session up to this one
worked only the first. A connector is a hosted HTTP endpoint, ours being
`/mcp` on the Worker, health-tested by Glama on its own roughly-hourly
schedule. A server is a repository listing, verified by building a
Dockerfile and checking that the process starts and answers introspection.
They have different URLs, different check regimes, and different badges.

That matters because the badge the awesome-mcp-servers maintainer asks for
is the **server** score badge,
`glama.ai/mcp/servers/OWNER/REPO/badges/score.svg`. It is not the connector
badge, so the connector's unhealthy state does not block it. Session 71 left
the badge off the PR reasoning that "an unhealthy badge is worse than none",
which was correct about the connector and does not apply here.

The server route also sidesteps the problem entirely. It runs `mcp-server/`,
our stdio package, which never touches the Worker or the connector health
check that has now resisted three sessions. A `Dockerfile` at the repo root
builds it: two-stage, non-root, runtime dependencies only. It is unbuilt
here because docker is not installed on the authoring machine; what was
verified is the substance it packages, the built stdio server answering
`initialize` and `tools/list` over real stdio. That probe is what surfaced
the `serverInfo.version` drift, since the server had been announcing 0.1.0
from the published 0.1.1 with nothing able to see it.

Order matters if the badge is wanted: the badge URL 404s until the server
listing exists, and a broken image in the PR is worse than the omission
session 71 chose.

One divergence is deliberate and stays. The remote endpoint answers
`prompts/list` with an empty list; the stdio server still answers `-32601`.
The SDK's high-level `McpServer` declares the `prompts` capability as a side
effect of registering a handler, and `src/lib/mcp/protocol.test.ts` pins
that this server does not declare capabilities it does not have. Answering
without declaring would mean dropping to the low-level SDK `Server`, which
is a rewrite disproportionate to an unverified check.

### On whether the badge is worth chasing at all

Roughly 40% of 15,045 Glama connectors show unhealthy, Linear, Notion,
Atlassian and Sentry among them, and research found no case of anyone
getting a connector un-stuck. There is no re-scan button and no documented
re-check request; the routes are `support@glama.ai`, their Discord, and the
ownership claim now served at `/.well-known/glama.json`, which verifies
against a matching maintainer email within minutes. Treat the badge as close
to uninformative and size the effort accordingly.

### The 2026-08-28 mail from the maintainer

A message to open awesome-mcp-servers PR authors, framed as updated listing
requirements: list the server on Glama, confirm it passes checks ("we only
need the server to start and respond to introspection requests"), and add
the score badge after the description. The wording reads as a broadcast
rather than a note about our PR specifically. It removes a stated blocker;
against 1,880 arrivals a month and 74 merges it does not make the merge
likely, and section 3's repricing stands.

## 2. mcp.so (dropped)

Decided 2026-08-23, after the operator found no free submission path.
Recorded here rather than left as a standing to-do, so it is not
rediscovered and re-evaluated every time this file is read.

The reasoning is that a paid listing buys placement in one directory,
while the channels that actually feed discovery are free and already
covered. The official MCP registry is the upstream several directories
read from, which is how Glama listed aboard without a submission at all.
awesome-mcp-servers is a pull request. Those two plus Glama are the
reach a paid slot would be competing with.

Revisit only if mcp.so turns out to be a meaningful referrer for
comparable servers, which the chunk 4 instrumentation would show.

## 3. awesome-mcp-servers

<https://github.com/punkpeye/awesome-mcp-servers>. This one is a pull
request, so it is the most exacting of the three and the draft below is
ready to paste.

**Filed 2026-08-26 as [#12962](https://github.com/punkpeye/awesome-mcp-servers/pull/12962)**, one line in `🔬 Research` between `OrgMentem/zotio` and `ovlabs/mcp-server-originalvoices`, with no Glama score badge because the connector currently renders unhealthy and an unhealthy badge is worse than none.

**File it, and then forget about it.** Measured 2026-08-26: 3,575 open
pull requests, 1,880 opened in the last 30 days against 74 merged, and
no commit to `main` since 2026-08-17. A submission filed today sits
behind the whole backlog, and the oldest entry still open was filed
2025-12-03. Four years is the optimistic reading and assumes the queue
drains in order, which it does not.

The `🤖🤖🤖` agent fast track `CONTRIBUTING.md` offers does not change
this. 1,666 of the 3,575 open pull requests already carry it, so it
marks 47% of the queue and confers no priority.

None of that is a reason to skip it. One submission costs nothing to
maintain and the backlink is permanent if it ever lands. It is a reason
not to sequence anything behind it, and not to treat "merged" as a
completion condition. `research/review-capacity.md` works through what
this failure mode implies for aboard's own admission gate, which has the
same shape.

**Section.** `### 🔬 Research`, which the file introduces as "Tools for
conducting research, surveys, interviews, and data collection". The
neighbours there are the right ones: election results at
polling-station level, legislative data, Philippine government data,
scholarly identifier resolution. `🧠 Knowledge & Memory` is the runner-up
and is about agent memory stores, which aboard is not.

**Placement.** `CONTRIBUTING.md` asks for alphabetical order within a
category. Case-insensitively, `ostin-pil` sorts after `OrgMentem/zotio`
and before `ovlabs/mcp-server-originalvoices`. Put the line between those
two. The section is not perfectly sorted in practice, so do not try to
fix its neighbours in the same PR.

**The line.** One line, no wrapping, exactly as below:

```
- [ostin-pil/aboard](https://github.com/ostin-pil/aboard) 📇 ☁️ 🏠 🍎 🪟 🐧 - Falsifiable claims about systemic problems as an agent-queryable graph: symptom/mechanism/leverage-point trees, time-boxed forecasts with resolution criteria, and steel-manned dual-dossier debates with ranked cruxes. Five read tools plus four gated write tools that open a pull request a human must review; nothing auto-merges. Published as JSON-LD against a versioned schema. `npx aboard-mcp-server`, or hosted at `https://aboard.untype.me/mcp`.
```

The legend symbols in it, so you can check them against the README's key
rather than trusting this file: `📇` TypeScript/JavaScript, `☁️` cloud
service (the hosted `/mcp` endpoint), `🏠` local service (stdio over
npx), and `🍎 🪟 🐧` because the package is plain Node with two
dependencies and nothing platform-specific.

`🎖️` marks an official implementation. aboard's maintainer wrote this
server, so it qualifies on the letter of the legend, but in practice the
mark reads as a vendor badge on well-known services. Left off. Add it if
you disagree; it is a one-character edit.

If Glama has indexed by the time you open the PR, insert its badge
immediately after the repository link, matching the neighbours:

```
[![ostin-pil/aboard MCP server](https://glama.ai/mcp/servers/ostin-pil/aboard/badges/score.svg)](https://glama.ai/mcp/servers/ostin-pil/aboard)
```

Confirm that URL against the listing Glama actually creates before
pasting it. The section shows both an `@owner/repo` and a bare
`owner/repo` spelling, so the shape is not reliably predictable.

**PR title.**

```
Add ostin-pil/aboard to Research
```

**PR body.**

```
Adds `aboard`, an MCP server over a graph of falsifiable claims about
systemic problems (democratic backsliding, inequality, and the epistemic
stack), published as JSON-LD against a versioned schema.

Nine tools. Five read the graph: claims, the full graph, forecasts, and
dual-dossier debates. Four propose new content, and every one of them
opens a pull request against the repository rather than writing to it.
Nothing auto-merges: a human reviews and CI has to pass.

- npm: https://www.npmjs.com/package/aboard-mcp-server
- Official MCP registry: me.untype/aboard
- Hosted endpoint: https://aboard.untype.me/mcp
- License: Apache-2.0 (code), CC BY 4.0 (the claim corpus)

Placed alphabetically in Research, between OrgMentem/zotio and
ovlabs/mcp-server-originalvoices.
```

`CONTRIBUTING.md` offers a fast track for automated agents: append
`🤖🤖🤖` to the PR title to opt in. This PR is opened by a human from a
prepared draft, so leave the title as written above.

## 4. Search Console

**Done 2026-08-27.** Both steps below were carried out as written. The
property is a Domain property on `untype.me`, and `sitemap.xml` is
submitted. The paragraphs that follow are kept as the record of why it was
done this way, not as outstanding work.

The warning about the apex TXT set was the part that mattered, and it held:
the two existing records survived byte-identical, so the MCP registry key
needed no rotation. Measured after verification rather than assumed:

```
"google-site-verification=PW8b-0ePRCSxgn400EHWja_U1Vlgg7hP1aNNpE6VRp8"
"v=MCPv1; k=ecdsap384; p=A+f9jyWwWhQn3ZbZ6pxY+fkR8UGjO3wf6aksCbHqStJV8Fn0l3LlZ8tRiGwYsI1T/Q=="
"v=spf1 include:spf.efwd.spaceship.net ~all"
```

Three records, which is the count this section said to expect. Re-run
`dig +short TXT untype.me` before touching the zone again for any reason.

Two steps, verification then the sitemap.

**Property type.** Use a Domain property on `untype.me`, not a URL-prefix
property on `https://aboard.untype.me/`.

The usual argument against a domain property is that it pools every
subdomain into one report. That does not apply here: the apex has no A or
AAAA record and nothing else on the zone serves a site, so a domain
property on `untype.me` reports aboard and only aboard today, while
covering any subdomain added later without a second verification.

It also avoids touching the repo. URL-prefix verification wants either an
HTML file under `public/` or a meta tag in `layout.tsx`, both of which
are a commit, a deploy, and a file that then has to stay forever. DNS
verification is a record in Cloudflare, and DNS is already the channel
this project verifies things over.

**Verification.** Search Console will issue a TXT record of the form
`google-site-verification=<token>`. Add it at the apex of `untype.me` in
Cloudflare DNS, where the nameservers are (`lochlan.ns.cloudflare.com`,
`oaklyn.ns.cloudflare.com`).

One warning, and it is the reason this step gets its own paragraph. The
apex already holds two TXT records:

```
"v=MCPv1; k=ecdsap384; p=A+f9jyWwWhQn3ZbZ6pxY+fkR8UGjO3wf6aksCbHqStJV8Fn0l3LlZ8tRiGwYsI1T/Q=="
"v=spf1 include:spf.efwd.spaceship.net ~all"
```

The first is what authorises publishing to the MCP registry, and losing
it costs a key rotation (`knowledge/issues.md`, 2026-08-19). The second
is email forwarding. A name can hold many TXT records, so the Google one
is an addition. Add a new record. Do not edit either of these, and do not
use any Cloudflare control that offers to replace the TXT set.

Verify with `dig +short TXT untype.me` before clicking Verify: three
records should come back, the two above unchanged plus the Google one.

**Sitemap.** Once the property is verified, go to Sitemaps and submit
`sitemap.xml`. The live file lists 33 URLs and `robots.txt` already names
it, so this only tells Google to fetch it now rather than on its own
schedule.

Both were checked on 2026-08-22: `sitemap.xml` answers `200
application/xml` with 33 `<url>` entries, and `robots.txt` ends with
`Sitemap: https://aboard.untype.me/sitemap.xml`.

**What to look at afterwards.** Coverage and Pages, a week or so later.
The site is a static export, so indexing problems here would be about
discovery rather than rendering. This is also the measurement chunk 8
wants in place before the launch post, alongside the chunk 4
instrumentation.

## Canonical copy

Reuse these rather than writing per-site variants.

**Name.** aboard

**One line, under 100 characters.**

```
An agent-first board of falsifiable claims about systemic problems facing humanity.
```

**Short, two sentences.**

```
An agent-first board of falsifiable claims about systemic problems: causal graphs of symptom, mechanism and leverage point; time-boxed forecasts with explicit resolution criteria; and steel-manned dual-dossier debates with ranked cruxes. Everything is published as machine-readable JSON-LD against a versioned schema.
```

**Long, for a form with room.**

```
aboard publishes falsifiable claims about systemic problems (democratic backsliding, inequality, and the epistemic stack) as a machine-readable graph. Three modules sit over one claim graph: problem trees linking symptom to mechanism to leverage point, time-boxed forecasts carrying resolution criteria a distrustful reader could settle, and adversarial debates presented as a steel-manned dual dossier with cruxes ranked by impact and uncertainty.

The MCP server exposes nine tools. Five read: list_claims, get_claim, get_graph, get_forecast, get_dossier. Four write: propose_claim, propose_edge, propose_forecast_prediction, propose_dossier. Every write validates against the canonical schemas, stamps provenance server-side from the calling agent's token, and opens a pull request. None of them merges anything; a human is the admission gate and CI must pass.

Agents are the intended primary contributors, so the write path is the point rather than a feature. The endpoint underneath is plain HTTP, so MCP is a convenience and not a requirement.
```

**Install.**

```
npx aboard-mcp-server
```

**Client config.**

```json
{
  "mcpServers": {
    "aboard": { "command": "npx", "args": ["-y", "aboard-mcp-server"] }
  }
}
```

**Links.**

- Site: <https://aboard.untype.me>
- About: <https://aboard.untype.me/about>
- Repository: <https://github.com/ostin-pil/aboard>
- Server directory: <https://github.com/ostin-pil/aboard/tree/main/mcp-server>
- npm: <https://www.npmjs.com/package/aboard-mcp-server>
- Hosted MCP endpoint: `https://aboard.untype.me/mcp`
- JSON-LD API: `https://aboard.untype.me/api/graph`
- Schema: <https://aboard.untype.me/schema/v0.json>
- License: Apache-2.0 for code, CC BY 4.0 for the claim corpus

## Done means

- The registry entry at `me.untype/aboard` reports `0.1.1` and carries a
  `packages` array naming `aboard-mcp-server`.
- Glama lists aboard as healthy. (mcp.so is dropped, see section 2.)
- The awesome-mcp-servers PR is **filed**. Merged is not a condition
  this project can satisfy; see section 3 for the throughput numbers.
- `untype.me` is a verified Search Console domain property, the
  `v=MCPv1` TXT record is intact, and `sitemap.xml` is submitted.
  **Met 2026-08-27**, with the TXT set checked after the edit rather than
  before it.
