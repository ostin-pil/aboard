/**
 * The two agent endpoints: `POST /api/proposals` (the write path) and
 * `POST /mcp` (the remote MCP server, in ./mcp.ts).
 *
 * aboard is a static export, so it has no server runtime — Next Route Handlers
 * under `output: "export"` support GET only. Both endpoints therefore live in
 * the Cloudflare Worker that already fronts the static assets. Same origin, same
 * deploy, and the GitHub credential stays server-side. Everything that is not
 * one of these endpoints falls through to the assets binding untouched.
 *
 * The MCP endpoint is a second door onto the same room: its `propose_*` tools
 * call `runProposal` below, so an MCP write and an HTTP write are the same
 * write, with the same auth, the same rate limit, and the same validation.
 *
 * This Worker is a deliberately thin shell: HTTP, token lookup, and GitHub
 * calls. Every decision that matters — what a valid proposal is, which id gets
 * minted, what the committed file looks like — lives in src/lib/proposals.ts and
 * src/lib/data/serialize.ts, which are pure and unit-tested. It imports the
 * canonical Zod schemas from src/lib/types.ts, so there is exactly one
 * definition of what aboard's data is.
 *
 * Posture (research/integrity-anti-gaming.md): PR-only, never an autonomous
 * merge. The caller supplies content; it does not supply identity, ids, or
 * timestamps. Those are stamped from the token it authenticated with.
 */
import {
  ClaimPayload,
  EdgePayload,
  PredictionPayload,
  DossierPayload,
  ProposalEnvelope,
  buildClaim,
  buildEdge,
  buildPrediction,
  buildDossier,
  type TokenIdentity,
} from "../src/lib/proposals";
import {
  claimToMarkdown,
  claimPath,
  appendEdgeToYaml,
  appendPredictionToForecast,
  dossierToYaml,
  dossierPath,
} from "../src/lib/data/serialize";
import { isTransientStatus, withRetry } from "../src/lib/http-retry";
import {
  audienceMatches,
  authorizeWrite,
  parseBearer,
  resolveStaticIdentity,
  type ChallengeOptions,
  type Credential,
} from "../src/lib/mcp/auth";
import { handleMcp } from "./mcp";
import { whoamiResponse, withOAuth } from "./oauth";
import { markdownTwinPath, prefersMarkdown } from "../src/lib/markdown-negotiation";
import { withinRateLimit, type RateLimiter } from "../src/lib/rate-limit";
import type { Claim, Dossier, Edge, Prediction } from "../src/lib/types";

interface Env {
  /** Static assets binding — the built `out/` directory. */
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  /** JSON: { "<secret-token>": { tokenId, operator, agent, agentId }, ... } */
  ABOARD_AGENT_TOKENS?: string;
  /** Fine-grained PAT: contents + pull-requests, this repo only. */
  GITHUB_TOKEN?: string;
  /** e.g. "ostin-pil/aboard" */
  GITHUB_REPO?: string;
  /** Branch proposals target. Defaults to "main". */
  GITHUB_BASE_BRANCH?: string;
  /** Native Workers rate-limit binding, keyed per credential. Optional: when
   *  unbound the write path still works (the limiter fails open). */
  PROPOSAL_LIMITER?: RateLimiter;
  /** Injected into `env` by `@cloudflare/workers-oauth-provider` before it
   *  calls the default handler. Always present once the wrapper is in place,
   *  which is why it is not the signal for "OAuth is configured". */
  OAUTH_PROVIDER?: OAuthHelpers;
  /** The provider's storage. Its presence *is* the signal: without it there is
   *  no authorization server to discover and no token that could resolve. */
  OAUTH_KV?: unknown;
}

/** What an authorization-server grant carries about the human and the client
 *  behind it. Stamped into the grant at consent, read back here. */
type GrantProps = {
  /** The verified GitHub login of the human who consented. */
  login?: string;
  /** The registered OAuth client's display name. */
  clientName?: string;
};

/** A token as `unwrapToken` returns it. Narrowed to the fields we read, so a
 *  library change surfaces here rather than deep in the request path.
 *
 *  `scope` is already an array in 0.8.2, not the space-delimited string the
 *  wire format uses. Checked against the published build rather than the
 *  repository's main branch, where other details differ. */
type TokenSummary = {
  userId: string;
  scope: string[];
  audience?: string | string[];
  grant: { clientId: string; scope: string[]; props: GrantProps };
};

/** The slice of the provider's helper API the default handler uses. `/mcp`
 *  cannot be an `apiRoute` (that would 401 anonymous reads), so it validates
 *  tokens itself through this. */
type OAuthHelpers = {
  unwrapToken: (token: string) => Promise<TokenSummary | null>;
};

/** Mirrors the `period` on the PROPOSAL_LIMITER binding in wrangler.jsonc; used
 *  only for the `Retry-After` hint. Keep the two in sync. */
const RATE_LIMIT_PERIOD_S = 60;

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: JSON_HEADERS });
}

/** Errors are structured so an agent can act on them without scraping prose. */
function fail(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return json({ error: { code, message, ...extra } }, status);
}

/** Zod issues → the compact, field-pathed shape the caller can act on. */
function issuesOf(error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }) {
  return error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message }));
}

// --- auth ------------------------------------------------------------------

/**
 * Resolve the request's credential from either source.
 *
 * Two doors, one definition of who may write. Static agent tokens are the
 * shipped contract (session 20) and stay; OAuth tokens are minted by our own
 * authorization server and resolved through it. The decision about what a
 * resolved credential may do lives in `src/lib/mcp/auth.ts`, not here.
 *
 * Static wins where a token somehow matches both, because the table is
 * operator-curated and an entry in it is a deliberate act.
 */
async function resolveCredential(env: Env, request: Request): Promise<Credential> {
  const token = parseBearer(request.headers.get("authorization"));
  if (!token) return { kind: "none" };

  const staticIdentity = resolveStaticIdentity(token, env.ABOARD_AGENT_TOKENS);
  if (staticIdentity) return { kind: "static", identity: staticIdentity };

  if (!env.OAUTH_KV || !env.OAUTH_PROVIDER) {
    // No authorization server on this deployment, so the static table was the
    // only thing a token could have been.
    return { kind: "invalid", reason: "Unrecognized agent token." };
  }

  const grant = await env.OAUTH_PROVIDER.unwrapToken(token);
  if (!grant) {
    // unwrapToken returns null for a token that is unknown, expired, or not
    // ours. All three are the same answer to the caller, and distinguishing
    // them would tell an attacker which tokens exist.
    return { kind: "invalid", reason: "The access token is invalid or has expired." };
  }

  if (!audienceMatches(grant.audience)) {
    return {
      kind: "invalid",
      reason: "This access token was issued for a different resource.",
    };
  }

  const props = grant.grant.props ?? {};
  return {
    kind: "oauth",
    subject: grant.userId,
    scopes: grant.scope,
    identity: {
      // The branch name carries this, so keep it short and filesystem-safe.
      tokenId: `gh-${props.login ?? grant.userId}`.slice(0, 40).replace(/[^a-zA-Z0-9._-]/g, "-"),
      // A verified GitHub login, rather than a string a human typed into a
      // table. This is the provenance upgrade the whole slice is for.
      operator: props.login ?? grant.userId,
      agent: props.clientName ?? grant.grant.clientId,
      agentId: grant.grant.clientId,
    },
  };
}

/** OAuth discovery is only advertised once there is something to discover.
 *  See `ChallengeOptions` in `src/lib/mcp/auth.ts`. */
function challengeOptions(env: Env): ChallengeOptions {
  return { discovery: Boolean(env.OAUTH_KV) };
}

/** Memoize per request: an MCP write authorizes in the endpoint shell and
 *  again in `runProposal`, and that should not be two KV reads. */
function credentialOnce(env: Env, request: Request): () => Promise<Credential> {
  let pending: Promise<Credential> | null = null;
  return () => (pending ??= resolveCredential(env, request));
}

// --- the current graph, read from our own published API --------------------

type Graph = {
  claimIds: string[];
  claimDomains: Map<string, string>;
  claimIdsByDomain: Map<string, string[]>;
  edgeIds: string[];
  /** forecastId → the domain of the claim it is attached to (its file's domain). */
  forecastDomains: Map<string, string>;
  /** claim ids that already have a dossier — so a new one is not proposed over them. */
  claimsWithDossier: Set<string>;
};

/**
 * The current graph, read from the deployed `/api/graph` asset.
 *
 * The Worker has no filesystem, so `data/` is not reachable — but the built
 * graph is, and it is the same graph the loader produced. Reading it is what
 * lets the server mint ids that collide with nothing and check that an edge's
 * endpoints exist.
 */
async function readGraph(env: Env, request: Request): Promise<Graph | null> {
  const url = new URL("/api/graph", request.url);
  const res = await env.ASSETS.fetch(new Request(url.toString()));
  if (!res.ok) return null;

  const body = (await res.json()) as {
    "aboard:claims"?: unknown;
    "aboard:edges"?: unknown;
    "aboard:forecasts"?: unknown;
    "aboard:dossiers"?: unknown;
  };
  const claims = body["aboard:claims"];
  if (!Array.isArray(claims)) return null;

  const claimIds: string[] = [];
  const claimDomains = new Map<string, string>();
  const claimIdsByDomain = new Map<string, string[]>();

  for (const entry of claims as Record<string, unknown>[]) {
    const id = typeof entry["aboard:id"] === "string" ? entry["aboard:id"] : "";
    const domain = typeof entry["aboard:domain"] === "string" ? entry["aboard:domain"] : "";
    if (!id || !domain) continue;
    claimIds.push(id);
    claimDomains.set(id, domain);
    claimIdsByDomain.set(domain, [...(claimIdsByDomain.get(domain) ?? []), id]);
  }

  const edges = body["aboard:edges"];
  const edgeIds: string[] = [];
  if (Array.isArray(edges)) {
    for (const entry of edges as Record<string, unknown>[]) {
      const id = typeof entry["aboard:id"] === "string" ? entry["aboard:id"] : "";
      if (id) edgeIds.push(id);
    }
  }

  // A forecast's file lives in the domain of the claim it is attached to, so its
  // domain is that claim's domain.
  const forecasts = body["aboard:forecasts"];
  const forecastDomains = new Map<string, string>();
  if (Array.isArray(forecasts)) {
    for (const entry of forecasts as Record<string, unknown>[]) {
      const id = typeof entry["aboard:id"] === "string" ? entry["aboard:id"] : "";
      const attached = entry["aboard:attachedTo"] as { "@id"?: string } | undefined;
      const claimId = typeof attached?.["@id"] === "string" ? attached["@id"].split("/").pop() ?? "" : "";
      const domain = claimDomains.get(claimId);
      if (id && domain) forecastDomains.set(id, domain);
    }
  }

  const dossiers = body["aboard:dossiers"];
  const claimsWithDossier = new Set<string>();
  if (Array.isArray(dossiers)) {
    for (const entry of dossiers as Record<string, unknown>[]) {
      const attached = entry["aboard:attachedTo"] as { "@id"?: string } | undefined;
      const claimId = typeof attached?.["@id"] === "string" ? attached["@id"].split("/").pop() ?? "" : "";
      if (claimId) claimsWithDossier.add(claimId);
    }
  }

  return {
    claimIds,
    claimDomains,
    claimIdsByDomain,
    edgeIds,
    forecastDomains,
    claimsWithDossier,
  };
}

// --- GitHub ----------------------------------------------------------------

type GitHubContext = { repo: string; token: string; base: string };

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

type GhResult = { ok: boolean; status: number; body: Record<string, unknown> };

async function gh(ctx: GitHubContext, path: string, init: RequestInit = {}): Promise<GhResult> {
  const res = await fetch(`https://api.github.com/repos/${ctx.repo}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${ctx.token}`,
      "user-agent": "aboard-proposals",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A GitHub GET, retried through a transient 5xx/429 (the base-ref read that a
 * live GitHub incident 503'd). Reads only — the mutating calls stay single-shot,
 * since a 5xx on a POST/PUT is ambiguous and a blind retry could double-create.
 */
async function ghGet(ctx: GitHubContext, path: string): Promise<GhResult> {
  return withRetry(() => gh(ctx, path), {
    retries: 3,
    transient: (r) => isTransientStatus(r.status),
    sleep,
  });
}

/** Current content + blob sha of a file on `ref`, or null if it does not exist. */
async function getFile(
  ctx: GitHubContext,
  path: string,
  ref: string,
): Promise<{ content: string; sha: string } | null> {
  const res = await ghGet(ctx, `/contents/${path}?ref=${encodeURIComponent(ref)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`could not read ${path} (HTTP ${res.status})`);
  const sha = typeof res.body.sha === "string" ? res.body.sha : "";
  const encoded = typeof res.body.content === "string" ? res.body.content : "";
  return { content: fromBase64(encoded), sha };
}

type ProposalSubmission = {
  /** Slug for the branch name, e.g. the minted id lowercased. */
  slug: string;
  identity: TokenIdentity;
  stamp: number;
  path: string;
  content: string;
  /** Present ⇒ update an existing file; absent ⇒ create a new one. */
  sha?: string;
  commitMessage: string;
  prTitle: string;
  prBody: string;
};

/**
 * Branch → commit the file → open a PR. Never merges: a human is the admission
 * gate, and CI (build + referential integrity + tests) runs on the PR, so a
 * proposal that would break the graph cannot be merged even by mistake.
 */
async function submitProposalPR(
  ctx: GitHubContext,
  s: ProposalSubmission,
): Promise<{ ok: true; url: string; branch: string } | { ok: false; detail: string }> {
  const branch = `agent/${s.identity.tokenId}/${s.slug}-${s.stamp}`;

  const baseRef = await ghGet(ctx, `/git/ref/heads/${ctx.base}`);
  if (!baseRef.ok) {
    return { ok: false, detail: `could not read base branch ${ctx.base} (HTTP ${baseRef.status})` };
  }
  const baseSha = (baseRef.body.object as { sha?: string } | undefined)?.sha;
  if (!baseSha) return { ok: false, detail: "base branch has no sha" };

  const created = await gh(ctx, "/git/refs", {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
  });
  if (!created.ok) {
    return { ok: false, detail: `could not create branch ${branch} (HTTP ${created.status})` };
  }

  const committed = await gh(ctx, `/contents/${s.path}`, {
    method: "PUT",
    body: JSON.stringify({
      message: s.commitMessage,
      content: toBase64(s.content),
      branch,
      ...(s.sha ? { sha: s.sha } : {}),
    }),
  });
  if (!committed.ok) {
    return { ok: false, detail: `could not commit ${s.path} (HTTP ${committed.status})` };
  }

  const pr = await gh(ctx, "/pulls", {
    method: "POST",
    body: JSON.stringify({ title: s.prTitle, head: branch, base: ctx.base, body: s.prBody }),
  });
  if (!pr.ok) return { ok: false, detail: `could not open PR (HTTP ${pr.status})` };

  const url = typeof pr.body.html_url === "string" ? pr.body.html_url : "";
  return { ok: true, url, branch };
}

function provenanceBlock(identity: TokenIdentity): string[] {
  return [
    `## Provenance`,
    ``,
    `Stamped server-side from the agent token; none of it is caller-asserted.`,
    ``,
    `- **operator** ${identity.operator}`,
    `- **agent** ${identity.agent}`,
    `- **agentId** \`${identity.agentId}\``,
  ];
}

function sourcesList(sources: Claim["sources"]): string {
  if (sources.length === 0) return "_None._";
  return sources.map((s) => `- [${s.label}](${s.url})${s.kind ? ` — ${s.kind}` : ""}`).join("\n");
}

function claimPrBody(claim: Claim, rationale: string, identity: TokenIdentity): string {
  return [
    `Filed by an agent through \`POST /api/proposals\`. **Not auto-merged** — a human is the admission gate.`,
    ``,
    `## Rationale`,
    ``,
    rationale,
    ``,
    `## Claim`,
    ``,
    `- **id** \`${claim.id}\` (minted server-side)`,
    `- **kind** ${claim.kind}`,
    `- **domain** ${claim.domain}`,
    `- **confidence** ${claim.confidence}`,
    ``,
    `> ${claim.statement.replace(/\n/g, "\n> ")}`,
    ``,
    `## Sources`,
    ``,
    sourcesList(claim.sources),
    ``,
    ...provenanceBlock(identity),
    ``,
    `## Reviewer checklist`,
    ``,
    `- [ ] The sources are real, and they say what the claim says they say.`,
    `- [ ] Confidence is calibrated, not decorative.`,
    `- [ ] The claim is falsifiable and belongs in this domain.`,
    `- [ ] CI is green (build, referential integrity, tests).`,
  ].join("\n");
}

function edgePrBody(
  edge: Edge,
  rationale: string,
  identity: TokenIdentity,
  crossDomain: boolean,
): string {
  return [
    `Filed by an agent through \`POST /api/proposals\`. **Not auto-merged** — a human is the admission gate.`,
    ``,
    `## Rationale`,
    ``,
    rationale,
    ``,
    `## Edge`,
    ``,
    `- **id** \`${edge.id}\` (minted server-side)`,
    `- **relation** \`${edge.fromId}\` **${edge.kind}** \`${edge.toId}\``,
    `- **strength** ${edge.strength}`,
    `- **scope** ${crossDomain ? "cross-domain" : "intra-domain"}`,
    ``,
    `## Sources`,
    ``,
    sourcesList(edge.sources),
    ``,
    ...provenanceBlock(identity),
    ``,
    `## Reviewer checklist`,
    ``,
    `- [ ] Both endpoints exist and the direction is right.`,
    `- [ ] The relation kind and strength are defensible, not decorative.`,
    `- [ ] The rationale (and any sources) actually support the relation.`,
    `- [ ] CI is green (build, referential integrity, tests).`,
  ].join("\n");
}

function predictionPrBody(
  forecastId: string,
  prediction: Prediction,
  rationale: string,
  identity: TokenIdentity,
): string {
  return [
    `Filed by an agent through \`POST /api/proposals\`. **Not auto-merged** — a human is the admission gate.`,
    ``,
    `## Reasoning`,
    ``,
    rationale,
    ``,
    `## Prediction`,
    ``,
    `- **forecast** \`${forecastId}\``,
    `- **probability** ${prediction.probability}`,
    ...(prediction.dataAnchors.length > 0
      ? [``, `## Data anchors`, ``, sourcesList(prediction.dataAnchors)]
      : []),
    ``,
    ...provenanceBlock(identity),
    ``,
    `## Reviewer checklist`,
    ``,
    `- [ ] The probability is defensible and the reasoning supports it.`,
    `- [ ] Any data anchors are real and load.`,
    `- [ ] The prediction sharpens the ensemble spread rather than padding it.`,
    `- [ ] CI is green (build, referential integrity, tests).`,
  ].join("\n");
}

function dossierPrBody(dossier: Dossier, rationale: string, identity: TokenIdentity): string {
  return [
    `Filed by an agent through \`POST /api/proposals\`. **Not auto-merged** — a human is the admission gate.`,
    ``,
    `## Rationale`,
    ``,
    rationale,
    ``,
    `## Dossier on \`${dossier.attachedToClaimId}\``,
    ``,
    `**Pro —** ${dossier.pro.thesis}`,
    ``,
    `**Con —** ${dossier.con.thesis}`,
    ``,
    `${dossier.cruxes.length} ranked crux${dossier.cruxes.length === 1 ? "" : "es"}; ` +
      `${dossier.pro.keySources.length + dossier.con.keySources.length} cited sources across both sides.`,
    ``,
    ...provenanceBlock(identity),
    ``,
    `## Reviewer checklist`,
    ``,
    `- [ ] Both sides are genuinely steel-manned, not a strawman paired with a favourite.`,
    `- [ ] Every keySource is real and supports its side.`,
    `- [ ] The cruxes are the questions that would actually move the disagreement.`,
    `- [ ] CI is green (build, referential integrity, tests).`,
  ].join("\n");
}

// --- the endpoint ----------------------------------------------------------

async function handleClaim(
  request: Request,
  env: Env,
  ctx: GitHubContext,
  identity: TokenIdentity,
  rawPayload: unknown,
  rationale: string,
): Promise<Response> {
  const payload = ClaimPayload.safeParse(rawPayload);
  if (!payload.success) {
    return fail(422, "invalid_payload", "The claim payload failed validation.", {
      issues: issuesOf(payload.error),
    });
  }

  const graph = await readGraph(env, request);
  if (!graph) return fail(503, "graph_unavailable", "Could not read the published graph.");

  if (!graph.claimIdsByDomain.has(payload.data.domain)) {
    return fail(422, "unknown_domain", `No such domain: "${payload.data.domain}".`, {
      knownDomains: [...graph.claimIdsByDomain.keys()].sort(),
    });
  }

  const built = buildClaim({
    payload: payload.data,
    identity,
    existingIdsInDomain: graph.claimIdsByDomain.get(payload.data.domain) ?? [],
    allExistingIds: graph.claimIds,
    now: new Date().toISOString(),
  });
  if (!built.ok) return fail(422, "cannot_build_claim", built.error);

  const result = await submitProposalPR(ctx, {
    slug: built.claim.id.toLowerCase(),
    identity,
    stamp: Date.now(),
    path: claimPath(built.claim),
    content: claimToMarkdown(built.claim),
    commitMessage: `feat(claims): propose ${built.claim.id} — ${built.claim.title}`,
    prTitle: `feat(claims): propose ${built.claim.id} — ${built.claim.title}`,
    prBody: claimPrBody(built.claim, rationale, identity),
  });
  if (!result.ok) return fail(502, "github_failed", `Could not open the proposal PR: ${result.detail}`);

  return json(
    {
      status: "proposed",
      kind: "claim",
      id: built.claim.id,
      path: claimPath(built.claim),
      branch: result.branch,
      pullRequest: result.url,
      note: "Opened as a pull request. It is not merged: a human reviews it, and CI must pass.",
    },
    201,
  );
}

async function handleEdge(
  request: Request,
  env: Env,
  ctx: GitHubContext,
  identity: TokenIdentity,
  rawPayload: unknown,
  rationale: string,
): Promise<Response> {
  const payload = EdgePayload.safeParse(rawPayload);
  if (!payload.success) {
    return fail(422, "invalid_payload", "The edge payload failed validation.", {
      issues: issuesOf(payload.error),
    });
  }

  const graph = await readGraph(env, request);
  if (!graph) return fail(503, "graph_unavailable", "Could not read the published graph.");

  const built = buildEdge({
    payload: payload.data,
    rationale,
    claimDomains: graph.claimDomains,
    claimIdsByDomain: graph.claimIdsByDomain,
    allEdgeIds: graph.edgeIds,
  });
  if (!built.ok) return fail(422, "cannot_build_edge", built.error);

  // An edge joins an existing YAML list, so read the current file to append to
  // it and to get the sha the update commit needs.
  let existing: { content: string; sha: string } | null;
  try {
    existing = await getFile(ctx, built.path, ctx.base);
  } catch (err) {
    return fail(502, "github_failed", (err as Error).message);
  }

  const result = await submitProposalPR(ctx, {
    slug: built.edge.id.toLowerCase(),
    identity,
    stamp: Date.now(),
    path: built.path,
    content: appendEdgeToYaml(existing?.content ?? "", built.edge),
    sha: existing?.sha,
    commitMessage: `feat(data): propose edge ${built.edge.id} (${built.edge.fromId} ${built.edge.kind} ${built.edge.toId})`,
    prTitle: `feat(data): propose edge ${built.edge.id} — ${built.edge.fromId} ${built.edge.kind} ${built.edge.toId}`,
    prBody: edgePrBody(built.edge, rationale, identity, built.crossDomain),
  });
  if (!result.ok) return fail(502, "github_failed", `Could not open the proposal PR: ${result.detail}`);

  return json(
    {
      status: "proposed",
      kind: "edge",
      id: built.edge.id,
      path: built.path,
      branch: result.branch,
      pullRequest: result.url,
      note: "Opened as a pull request. It is not merged: a human reviews it, and CI must pass.",
    },
    201,
  );
}

async function handlePrediction(
  request: Request,
  env: Env,
  ctx: GitHubContext,
  identity: TokenIdentity,
  rawPayload: unknown,
  rationale: string,
): Promise<Response> {
  const payload = PredictionPayload.safeParse(rawPayload);
  if (!payload.success) {
    return fail(422, "invalid_payload", "The prediction payload failed validation.", {
      issues: issuesOf(payload.error),
    });
  }

  const graph = await readGraph(env, request);
  if (!graph) return fail(503, "graph_unavailable", "Could not read the published graph.");

  const built = buildPrediction({
    payload: payload.data,
    reasoning: rationale,
    identity,
    knownForecastIds: new Set(graph.forecastDomains.keys()),
    now: new Date().toISOString(),
  });
  if (!built.ok) {
    return fail(422, "cannot_build_prediction", built.error, {
      knownForecasts: [...graph.forecastDomains.keys()].sort(),
    });
  }

  const domain = graph.forecastDomains.get(built.forecastId);
  const path = `data/${domain}/forecasts/${built.forecastId}.yaml`;

  let existing: { content: string; sha: string } | null;
  try {
    existing = await getFile(ctx, path, ctx.base);
  } catch (err) {
    return fail(502, "github_failed", (err as Error).message);
  }
  if (!existing) {
    return fail(502, "github_failed", `Forecast file ${path} not found on ${ctx.base}.`);
  }

  const stamp = Date.now();
  const result = await submitProposalPR(ctx, {
    slug: `${built.forecastId.toLowerCase()}-prediction`,
    identity,
    stamp,
    path,
    content: appendPredictionToForecast(existing.content, built.prediction),
    sha: existing.sha,
    commitMessage: `feat(forecast): propose a prediction on ${built.forecastId} (p=${built.prediction.probability})`,
    prTitle: `feat(forecast): propose a prediction on ${built.forecastId} (p=${built.prediction.probability})`,
    prBody: predictionPrBody(built.forecastId, built.prediction, rationale, identity),
  });
  if (!result.ok) return fail(502, "github_failed", `Could not open the proposal PR: ${result.detail}`);

  return json(
    {
      status: "proposed",
      kind: "prediction",
      id: built.forecastId,
      path,
      branch: result.branch,
      pullRequest: result.url,
      note: "Opened as a pull request. It is not merged: a human reviews it, and CI must pass.",
    },
    201,
  );
}

async function handleDossier(
  request: Request,
  env: Env,
  ctx: GitHubContext,
  identity: TokenIdentity,
  rawPayload: unknown,
  rationale: string,
): Promise<Response> {
  const payload = DossierPayload.safeParse(rawPayload);
  if (!payload.success) {
    return fail(422, "invalid_payload", "The dossier payload failed validation.", {
      issues: issuesOf(payload.error),
    });
  }

  const graph = await readGraph(env, request);
  if (!graph) return fail(503, "graph_unavailable", "Could not read the published graph.");

  const built = buildDossier({
    payload: payload.data,
    identity,
    claimExists: graph.claimDomains.has(payload.data.claimId),
    dossierExists: graph.claimsWithDossier.has(payload.data.claimId),
    now: new Date().toISOString(),
  });
  if (!built.ok) return fail(422, "cannot_build_dossier", built.error);

  const domain = graph.claimDomains.get(payload.data.claimId) ?? "";
  const path = dossierPath(payload.data.claimId, domain);

  const result = await submitProposalPR(ctx, {
    slug: `${payload.data.claimId.toLowerCase()}-dossier`,
    identity,
    stamp: Date.now(),
    path,
    content: dossierToYaml(built.dossier),
    commitMessage: `feat(dossier): propose a dual-dossier on ${payload.data.claimId}`,
    prTitle: `feat(dossier): propose a dual-dossier on ${payload.data.claimId}`,
    prBody: dossierPrBody(built.dossier, rationale, identity),
  });
  if (!result.ok) return fail(502, "github_failed", `Could not open the proposal PR: ${result.detail}`);

  return json(
    {
      status: "proposed",
      kind: "dossier",
      id: payload.data.claimId,
      path,
      branch: result.branch,
      pullRequest: result.url,
      note: "Opened as a pull request. It is not merged: a human reviews it, and CI must pass.",
    },
    201,
  );
}

/**
 * Everything the write path does once an envelope can be produced: auth, flood
 * brake, config check, canonical validation, dispatch.
 *
 * Two callers reach it. `POST /api/proposals` reads the envelope from the HTTP
 * body; the MCP endpoint builds one from a `propose_*` tool's arguments. Both
 * come through here, so there is exactly one definition of who may write and
 * what happens when they do — a second copy of the auth or rate-limit check is
 * how those two things drift apart.
 *
 * The envelope arrives as a thunk rather than a value so the checks keep their
 * order: an unauthenticated caller is turned away before its body is read. The
 * credential arrives as one for a different reason: it is memoized per request,
 * so an MCP write that authorizes here and in the endpoint shell costs one
 * token lookup rather than two.
 *
 * A refusal carries `WWW-Authenticate`. This endpoint is not an MCP endpoint,
 * but it is an OAuth protected resource, and RFC 9728 discovery is worth the
 * one header on both doors.
 */
async function runProposal(
  request: Request,
  env: Env,
  credential: () => Promise<Credential>,
  readEnvelope: () => Promise<unknown>,
): Promise<Response> {
  const outcome = authorizeWrite(await credential(), challengeOptions(env));
  if (!outcome.allowed) {
    const { status, error, description, wwwAuthenticate } = outcome.challenge;
    return new Response(
      JSON.stringify(
        { error: { code: error ?? "unauthorized", message: description } },
        null,
        2,
      ),
      { status, headers: { ...JSON_HEADERS, "www-authenticate": wwwAuthenticate } },
    );
  }
  const { identity, rateLimitKey } = outcome;

  // Flood brake: cap proposals per credential before touching GitHub. Keyed by
  // the credential's stable handle (a token id, or an OAuth subject), so one
  // leaked or runaway credential cannot open an unbounded burst of PRs. Fails
  // open (see withinRateLimit).
  if (!(await withinRateLimit(env.PROPOSAL_LIMITER, rateLimitKey))) {
    const body = {
      error: {
        code: "rate_limited",
        message: "Too many proposals from this credential; retry shortly.",
        retryAfterSeconds: RATE_LIMIT_PERIOD_S,
      },
    };
    return new Response(JSON.stringify(body, null, 2), {
      status: 429,
      headers: { ...JSON_HEADERS, "retry-after": String(RATE_LIMIT_PERIOD_S) },
    });
  }

  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    return fail(503, "not_configured", "The proposals endpoint has no GitHub credential configured.");
  }

  let raw: unknown;
  try {
    raw = await readEnvelope();
  } catch {
    return fail(400, "invalid_json", "Request body is not valid JSON.");
  }

  const envelope = ProposalEnvelope.safeParse(raw);
  if (!envelope.success) {
    return fail(422, "invalid_envelope", "The proposal envelope is malformed.", {
      issues: issuesOf(envelope.error),
    });
  }

  const ctx: GitHubContext = {
    repo: env.GITHUB_REPO,
    token: env.GITHUB_TOKEN,
    base: env.GITHUB_BASE_BRANCH ?? "main",
  };
  const { kind, payload, rationale } = envelope.data;

  if (kind === "claim") return handleClaim(request, env, ctx, identity, payload, rationale);
  if (kind === "edge") return handleEdge(request, env, ctx, identity, payload, rationale);
  if (kind === "prediction") return handlePrediction(request, env, ctx, identity, payload, rationale);
  if (kind === "dossier") return handleDossier(request, env, ctx, identity, payload, rationale);

  return fail(501, "not_implemented", `\`${kind}\` is declared but not wired.`);
}

async function handleProposal(
  request: Request,
  env: Env,
  credential: () => Promise<Credential>,
): Promise<Response> {
  if (request.method !== "POST") {
    return fail(405, "method_not_allowed", "POST a proposal envelope to this endpoint.");
  }
  return runProposal(request, env, credential, () => request.json());
}

// --- Markdown content negotiation ------------------------------------------

const MARKDOWN_HEADERS = {
  "content-type": "text/markdown; charset=utf-8",
  // The same URL now has two representations, so any cache between us and the
  // agent has to key on Accept.
  vary: "Accept",
  // Cloudflare's edge cache keys on Accept-Encoding, not on Accept, so `Vary`
  // alone would not stop a cached Markdown response from being handed to the
  // next browser that asks the same URL for HTML. The twins are cheap to
  // regenerate, so decline to be cached rather than risk serving a page as
  // Markdown. The HTML responses keep their normal caching.
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
};

/**
 * Serve the Markdown twin of a page when the request asked for Markdown, or
 * null to let the request fall through to HTML.
 *
 * Null covers every "no" — wrong method, no Markdown preference, a path that
 * cannot have a twin, and a page whose twin does not exist. That last one is
 * what makes this self-maintaining: the asset lookup is the source of truth on
 * which pages have twins, so adding a twin route is all it takes to make that
 * page negotiate.
 */
async function serveMarkdownTwin(request: Request, env: Env): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  if (!prefersMarkdown(request.headers.get("accept"))) return null;

  const url = new URL(request.url);
  const twin = markdownTwinPath(url.pathname);
  if (!twin) return null;

  const asset = await env.ASSETS.fetch(new Request(new URL(twin, url).toString()));
  if (!asset.ok) return null;

  return new Response(request.method === "HEAD" ? null : asset.body, {
    status: 200,
    headers: MARKDOWN_HEADERS,
  });
}

/**
 * aboard's own routing. Reached through the authorization server wrapper
 * below, which handles the OAuth endpoints and injects `OAUTH_PROVIDER`
 * before falling through to here for everything else.
 */
const siteHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    // Resolved at most once per request, and only if something asks.
    const credential = credentialOnce(env, request);

    if (pathname === "/api/proposals") {
      return handleProposal(request, env, credential);
    }

    // What a credential resolves to. Served here rather than as an OAuth
    // `apiRoute` because the provider validates a token's audience against the
    // request path, and our tokens are bound to `/mcp` (see UNUSED_API_ROUTE).
    if (pathname === "/api/whoami") {
      const resolved = await credential();
      const identity =
        resolved.kind === "static" || resolved.kind === "oauth" ? resolved.identity : null;
      return whoamiResponse(identity);
    }

    // The remote MCP endpoint. Read tools project the same published JSON-LD the
    // assets binding serves; write tools go through runProposal, so an MCP write
    // and an HTTP write are the same write.
    if (pathname === "/mcp") {
      return handleMcp(request, {
        assets: env.ASSETS,
        credential,
        challengeOptions: challengeOptions(env),
        proposal: (envelope) => runProposal(request, env, credential, async () => envelope),
      });
    }

    // An agent asking a page URL for Markdown gets the page's twin, so it does
    // not have to know the twin convention to get Markdown out of a plain link.
    const markdown = await serveMarkdownTwin(request, env);
    if (markdown) return markdown;

    // Everything else is the static site.
    return env.ASSETS.fetch(request);
  },
};

/**
 * The deployed Worker.
 *
 * The authorization server wraps aboard rather than the other way round,
 * because the provider has to see a request before the site does: it owns the
 * token, registration and OAuth metadata endpoints, and it injects
 * `OAUTH_PROVIDER` into `env` on the way through. `/mcp` is deliberately not
 * one of its `apiRoute`s, so anonymous reads reach `siteHandler` untouched and
 * the per-call decision stays ours.
 *
 * With no `OAUTH_KV` bound and no GitHub OAuth App configured, the wrapper is
 * inert: `/oauth/*` answers 503, no discovery is advertised, and every
 * existing path behaves exactly as it did before. That is what lets this ship
 * ahead of the operator steps in `worker/README.md`.
 */
export default withOAuth(siteHandler as never);
