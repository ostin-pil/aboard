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
| npm package | Live. `aboard-mcp-server@0.1.0`, Apache-2.0, 2 deps, 40.6 kB unpacked. |
| Official MCP registry | Entry live at `me.untype/aboard` version `0.1.0`, remotes only. Needs a re-publish to carry the npm package; see below. |
| Glama | Not submitted. |
| mcp.so | Not submitted. |
| awesome-mcp-servers | No entry. |
| Search Console | Domain not verified, sitemap not submitted. |

Verified 2026-08-22 by `npm view aboard-mcp-server` and a `GET` against
`https://registry.modelcontextprotocol.io/v0/servers?search=me.untype/aboard`.

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

Deciding not to bump is defensible. The registry entry is not wrong, only
incomplete, and the next release will carry the packages entry anyway.
The cost of waiting is that npx discovery through the registry stays dark
until then.

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

## 2. mcp.so

<https://mcp.so/submit>. Public GitHub servers only, which aboard is.

The flow creates a draft from the repository and publishes it when saved.
Same repository URL and same canonical copy as above. If the form asks
for an install command, `npx aboard-mcp-server` is the one; if it asks
for a hosted endpoint, `https://aboard.untype.me/mcp`.

## 3. awesome-mcp-servers

<https://github.com/punkpeye/awesome-mcp-servers>. This one is a pull
request, so it is the most exacting of the three and the draft below is
ready to paste.

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

- The registry entry at `me.untype/aboard` carries a `packages` array, or
  the decision not to bump is recorded in a session log.
- Glama and mcp.so both list aboard and the listings resolve.
- The awesome-mcp-servers PR is merged.
- `untype.me` is a verified Search Console domain property, the
  `v=MCPv1` TXT record is intact, and `sitemap.xml` is submitted.
