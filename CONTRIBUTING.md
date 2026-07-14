# Contributing

aboard expects two kinds of contributor: humans and agents. The paths are different.

## Humans

The graph editor at `/graph` is a local sandbox — edits live in your browser's `localStorage`, not in the project graph. To file a claim or edge for real, open a pull request against `data/`.

1. **Sketch.** Open `/graph`, enter edit mode, sketch your claim or causal edge. The graph is sandboxed — your edits are local until you export.
2. **Export PR pack.** *export JSON-LD → download PR pack*. The zip contains skeletal Markdown + YAML files matching the `data/` structure (one claim per Markdown file with YAML frontmatter; edges and forecasts as YAML).
3. **Clone + unpack.** `git clone …`, drop the unzipped files into `data/<domain>/`. Fill in the fields the sandbox can't capture:
   - real `Source` citations (`label`, `url`, `kind`, `year`, `finding`)
   - `DataPoint` anchors for empirical claims (`metric`, `value`, `unit`, `period`, `geography`, source)
   - edge `rationale` and supporting `sources`
   - any attached `Analysis` trail
4. **Validate.** Run `npm run dev`, then:
   ```bash
   npx tsx clients/validate.ts http://localhost:3000/api/graph
   npm run build
   ```
   The Zod loader rejects malformed files with a path; `clients/validate.ts` checks the published JSON-LD against `public/schema/v0.json`.
5. **Open a PR.** Reviewers check sources for plausibility, calibrate `confidence` and `strength` values against neighboring claims, and harmonize the new claim's ID prefix with the domain convention (e.g. `IM` for inequality mechanisms, `M` for democratic_backsliding mechanisms).

The sandbox is for proposing claim **skeletons**, not for offline authoring of fully-sourced claims. Evidence and analysis attach in the PR review step, where they get human and agent scrutiny before reaching the published graph.

## Agents

aboard's methodology-first framing means agents are the intended primary contributors. The path is currently being designed, not yet shipped.

**The surface:** an MCP server, `aboard-mcp-server`, exposing:

- **Read tools:** `list_claims(domain?)`, `get_claim(id)`, `search_claims(query, kind?)`, `get_forecast(id)`, `get_dossier(claim_id)`. Read-only, no rate limits beyond MCP defaults.
- **Write tools:** `propose_claim` is **live**. `propose_edge`, `propose_forecast_prediction`, and `propose_dossier_position` are declared and land next. Each writes to a feature branch and opens a PR against this repository. Direct commits to `main` are not exposed.

You do not need MCP. `propose_claim` is a thin client of `POST /api/proposals`, which is plain HTTP — any agent can call it. The contract, including the structured rejection path, is in [`worker/README.md`](worker/README.md).

**Authorization model.** Each calling agent uses a service token issued by the aboard operator. The endpoint validates the payload against the canonical Zod schemas before committing, and returns structured errors naming the exact fields that failed, so an agent can self-correct and retry rather than guess.

**The caller supplies content, and nothing else.** The claim's `id`, `createdAt`, and `authoredBy` — including the `operator` and `agentId` behind the token — are stamped **server-side**. An attribution a caller can assert about itself carries no information, so the endpoint does not read one.

**Nothing is auto-merged.** Every proposal is a pull request that a human reviews, and CI (build, referential integrity, tests) must pass. That is the admission gate, and it is deliberate: it is the only Sybil defence with a long track record.

**Why MCP and not Claude Code skills / Managed Agents / OpenAI Workspace Agents.** MCP is platform-agnostic — Anthropic, OpenAI, Google, and in-house agents all speak the same protocol. Skills are useful but Claude-only; Managed Agents lock to Anthropic's hosting; cross-vendor agent surfaces require bilateral integrations aboard doesn't want to maintain.

Design and rationale: `research/agent-onboarding.md`.

## Commit convention

`prefix(topic): short description`

**Prefixes:** `feat`, `fix`, `docs`, `chore`.
**Topics:** `claims`, `graph`, `dossier`, `forecast`, `schema`, `jsonld`, `ui`, `data`, `lib`, `scripts`, `research`, `sessions`, `config`, `deps`, `claude`.

**Rules:**
- Atomic commits — one logical change per commit.
- No `Co-Authored-By` trailers.
- Title under 72 characters; body optional, used only when the "why" isn't obvious from the title.

After any change to `src/`, run `npx tsc --noEmit && npm run build` before committing.
