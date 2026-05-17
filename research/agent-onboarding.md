# Agent onboarding (research)

Status: **research draft — 2026-05-12**. Not implemented.

## Question

How does an *agent* — not a human developer — file a claim, edge, forecast prediction, or dossier position to aboard? The current PR-pack flow expects a human who can clone a repo, fill in fields the sandbox doesn't capture, run validators, and open a pull request. Methodology-first framing makes agents the primary contributors. They need a different surface.

## Decision

**MCP server.** Ship a separate npm package, `aboard-mcp-server`, that exposes the claim graph as read tools and proposes new content via gated write tools that open PRs.

## Why MCP

- **Platform-agnostic.** The Model Context Protocol is the industry-converged way for agents to call out to services. Anthropic-, OpenAI-, Google-, and in-house agents all speak it. aboard avoids vendor lock-in by choosing the protocol every framework already supports.
- **Discoverable.** Agents configured to use MCP can discover servers via registries and metadata cards. The discovery path is the protocol's responsibility, not aboard's.
- **Write-back is clean.** aboard owns the authorization layer (token, schema validation, commit signing). Agents request `propose_*`; aboard decides whether to accept; the response is structured (success → PR URL; rejection → schema error pointing at the offending field).
- **Maturity.** The protocol has been live since late 2024 with broad multi-vendor adoption. Investing here is not a research bet.

### Alternatives considered

| Path | Why not | Useful for |
|---|---|---|
| Claude Code skills | Claude-only. Discovery is marketplace farming. aboard would re-implement the filing logic per framework. | Distributing aboard-specific *workflows* (e.g. "regenerate forecast F4 with a new model") to Claude users, layered on top of the MCP server. |
| Anthropic Managed Agents | Locks aboard's hosting story to Anthropic; multi-agent delegation is research-preview. | Internal aboard automation (e.g. periodic re-runs) where the deployment story is fine. |
| OpenAI Workspace Agents / Custom GPTs | Cross-vendor. Requires bilateral integration. aboard would be a private connector. | If aboard ever wants a first-class OpenAI presence; not the shortest path. |
| GitHub App | Each agent framework would need its own integration. Doesn't address discoverability. | Underlying transport for the write tools (the MCP server could open PRs via a GitHub App). |

Note: numbers cited by some surveys of the MCP ecosystem (server counts, registry sizes, rate limits) have not been verified from primary sources. The qualitative case for MCP — platform-agnostic, mature, clean write-back model — stands without them.

## Tools sketch

### Read

| Tool | Args | Returns |
|---|---|---|
| `list_claims` | `domain?: string` | `Claim[]` (id, kind, title, domain, confidence) |
| `get_claim` | `id: string` | full Claim including sources, DataPoints, attached forecast/dossier IDs, edges |
| `search_claims` | `query: string, kind?: ClaimKind` | ranked `Claim[]` (full-text over title + body) |
| `get_forecast` | `id: string` | full Forecast with all predictions, baseRates, dataAnchors |
| `get_dossier` | `claim_id: string` | both positions, cruxes, keySources |
| `get_schema` | (none) | the v0 JSON Schema (so the agent can self-validate before proposing) |

### Write (gated; each opens a PR)

| Tool | Args | Side effect |
|---|---|---|
| `propose_claim` | full Claim payload + rationale | feature branch + PR with one new Markdown file in `data/<domain>/claims/` |
| `propose_edge` | from, to, kind, rationale, sources | feature branch + PR updating `data/<domain>/edges.yaml` (or `cross_domain_edges.yaml`) |
| `propose_forecast_prediction` | forecastId + Prediction payload | feature branch + PR appending to `data/<domain>/forecasts/<id>.yaml` |
| `propose_dossier_position` | claimId + side + position payload | feature branch + PR creating or updating `data/<domain>/dossiers/<claim-id>.yaml` |

Every write tool runs the proposed payload through the same Zod validators the loader uses (`src/lib/types.ts`) before opening the PR. Rejections return a structured error pointing at the offending field path.

## Authorization model

- Each calling agent uses a service token issued by aboard. Tokens carry an attribution string that ends up in `AgentAttribution.modelOrAuthor` on the committed payload.
- The server runs as a deploy target with a GitHub App installation that can open PRs against the aboard repo. The PR is opened from a branch named `agent/<token-id>/<timestamp>`.
- aboard's CI runs the existing `npm run build` (which exercises the Zod loader) on the PR; failure blocks merge.
- Human reviewers decide whether to merge. Auto-merge on green CI is an explicit option for some agents but not the default.

## Discoverability

- Public MCP Registry entry.
- A `.well-known/mcp-server` (or equivalent) metadata file on the aboard domain pointing at the server, describing its tools, and linking to schema + rationale docs. The exact metadata standard is still settling — pick whatever is canonical at implementation time.

## Effort estimate

1–2 weeks of engineering for a separate `aboard-mcp-server` package:

- Package scaffold (`packages/aboard-mcp/` or sibling repo). Decide based on whether the read tools need the live `src/lib/loader.ts` (sibling repo with a Git submodule) or can hit the existing `/api/graph` and `/api/claims/<id>` endpoints (cleaner separation, no shared code).
- Read tools first; deploy; verify a Claude-Code or OpenAI agent can call them.
- GitHub App + branch/PR opener.
- Write tools, each gated by Zod validation and producing a PR with a structured commit message.
- Server metadata + registry publication.

## Open decisions

Before building:

1. **Sibling repo or in-tree package?** Sibling repo keeps the deployment unit small but means duplicating the Zod types (or pinning them via a small `aboard-schema` package). In-tree keeps types canonical but bloats the Next.js project.
2. **Write-back model.** PR-only (every write opens a PR; never merges autonomously) is the safe default. A "trusted agent" tier that auto-merges on green CI is plausible later; not in v1.
3. **Service-key rotation.** Manual to start; aboard isn't yet at the scale that demands automated rotation.
4. **Reviewer assignment.** Round-robin between current maintainers, or assign by domain (democratic_backsliding vs. inequality), or simply leave unassigned until the maintainer set grows.
5. **Read-tool result shape.** The existing `/api/graph` and `/api/claims/<id>` endpoints already publish JSON-LD; the MCP server can either re-serialize to a tighter shape or pass JSON-LD through. Probably re-serialize — JSON-LD is verbose for an agent that just wants `Claim[]`.
6. **Authentication.** Token shared with each agent vs. OAuth-style installation flow. Token is simpler; OAuth is the right end state.
