/**
 * The agent write path: `POST /api/proposals`.
 *
 * aboard is a static export, so it has no server runtime — Next Route Handlers
 * under `output: "export"` support GET only. The write path therefore lives in
 * the Cloudflare Worker that already fronts the static assets. Same origin, same
 * deploy, and the GitHub credential stays server-side. Everything that is not
 * this endpoint falls through to the assets binding untouched.
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
  ProposalEnvelope,
  buildClaim,
  buildEdge,
  type TokenIdentity,
} from "../src/lib/proposals";
import {
  claimToMarkdown,
  claimPath,
  appendEdgeToYaml,
} from "../src/lib/data/serialize";
import type { Claim, Edge } from "../src/lib/types";

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
}

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

function resolveIdentity(env: Env, request: Request): TokenIdentity | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match || !env.ABOARD_AGENT_TOKENS) return null;

  let table: Record<string, TokenIdentity>;
  try {
    table = JSON.parse(env.ABOARD_AGENT_TOKENS) as Record<string, TokenIdentity>;
  } catch {
    return null;
  }

  return table[match[1]] ?? null;
}

// --- the current graph, read from our own published API --------------------

type Graph = {
  claimIds: string[];
  claimDomains: Map<string, string>;
  claimIdsByDomain: Map<string, string[]>;
  edgeIds: string[];
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

  return { claimIds, claimDomains, claimIdsByDomain, edgeIds };
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

async function gh(
  ctx: GitHubContext,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
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

/** Current content + blob sha of a file on `ref`, or null if it does not exist. */
async function getFile(
  ctx: GitHubContext,
  path: string,
  ref: string,
): Promise<{ content: string; sha: string } | null> {
  const res = await gh(ctx, `/contents/${path}?ref=${encodeURIComponent(ref)}`);
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

  const baseRef = await gh(ctx, `/git/ref/heads/${ctx.base}`);
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

async function handleProposal(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return fail(405, "method_not_allowed", "POST a proposal envelope to this endpoint.");
  }

  const identity = resolveIdentity(env, request);
  if (!identity) {
    return fail(401, "unauthorized", "A valid `Authorization: Bearer <token>` is required.");
  }

  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    return fail(503, "not_configured", "The proposals endpoint has no GitHub credential configured.");
  }

  let raw: unknown;
  try {
    raw = await request.json();
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

  return fail(
    501,
    "not_implemented",
    `\`${kind}\` is declared but not yet wired. \`claim\` and \`edge\` are implemented.`,
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/proposals") {
      return handleProposal(request, env);
    }
    // Everything else is the static site.
    return env.ASSETS.fetch(request);
  },
};
