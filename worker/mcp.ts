/**
 * The remote MCP endpoint: `POST /mcp`.
 *
 * Same shape as the write path one file over: this is a thin IO shell around a
 * pure core. `src/lib/mcp/protocol.ts` decides what a message means and what it
 * should produce; `src/lib/mcp/tools.ts` holds the catalogue. This file does the
 * three things that need the outside world — read the published JSON-LD through
 * the assets binding, file a proposal through the existing proposal pipeline,
 * and turn a plan into an HTTP response.
 *
 * Stateless by construction: no session store, no Durable Object, no KV. Each
 * POST is answered from its own body, which is what lets the endpoint serve both
 * the `2026-07-28` (per-request metadata) and `2025-11-25` (handshake) eras from
 * one handler. See `protocol.ts` for the era model.
 */
import {
  INTERNAL_ERROR,
  PARSE_ERROR,
  RESOURCE_NOT_FOUND,
  isAllowedOrigin,
  jsonToolResult,
  narratedToolResult,
  planMessage,
  resourceResult,
  toolResult,
  type Era,
  type JsonRpcErrorBody,
  type JsonRpcId,
  type McpPlan,
} from "../src/lib/mcp/protocol";
import { authorizeWrite, RESOURCE_URI, type ChallengeOptions, type Credential } from "../src/lib/mcp/auth";
import type { ReadOp, ToolDescriptor } from "../src/lib/mcp/tools";
import { mcpCallEvent, type EventPoint } from "../src/lib/telemetry";

export type ProposalEnvelopeInput = {
  kind: string;
  payload: unknown;
  rationale: string;
  /**
   * The tool this arrived through, stamped into the claim's attribution so a
   * reader can tell an MCP filing from an HTTP one. Set here rather than taken
   * from `args`, because a caller must not be able to assert its own
   * provenance. It rides alongside the envelope rather than inside it: the
   * envelope is Zod-validated and would drop an unknown key.
   */
  via: string;
};

export type McpDeps = {
  /** The built `out/` directory: the published JSON-LD the read tools project. */
  assets: { fetch: (request: Request) => Promise<Response> };
  /** The request's credential, memoized by the caller. Only write tools ask. */
  credential: () => Promise<Credential>;
  /** Whether to advertise OAuth discovery in a challenge. */
  challengeOptions: ChallengeOptions;
  /**
   * Challenge an uncredentialed caller at the handshake instead of at the
   * first write. Off by default, because reads are public and demanding a
   * token to list claims would be a regression for every ordinary client.
   *
   * It exists for gateways that decide a connection's authentication once,
   * when the connection is created, and never revisit it. Smithery's Connect
   * API is the worked example (session 35): its probe calls `initialize`,
   * our public reads answer 200, the connection is marked ready, and no grant
   * is ever obtained. The 401 a write raises later arrives after the only
   * moment such a client would have acted on it, so the write can never
   * succeed. Pointing that client at `?auth=required` moves the challenge to
   * where its model expects it.
   *
   * The resource is unchanged: same endpoint, same metadata document, same
   * token audience. This is when the challenge is raised, not what a token
   * is good for.
   */
  authRequired?: boolean;
  /**
   * Files a proposal through exactly the pipeline `POST /api/proposals` uses —
   * bearer auth, rate limit, canonical Zod validation, branch and PR. Passing a
   * function rather than importing the endpoint keeps the dependency one-way.
   */
  proposal: (envelope: ProposalEnvelopeInput) => Promise<Response>;
  /** Usage telemetry, one point per `tools/call` (`src/lib/telemetry.ts`).
   *  Optional and fire-and-forget: absent means no telemetry, never an error. */
  record?: (point: EventPoint) => void;
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

/** The endpoint is same-origin for agents and never sets a cookie, so echoing
 *  the (already validated) origin is enough for a browser-side client. */
function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "access-control-allow-origin": origin && origin !== "null" ? origin : "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-method, mcp-name, mcp-session-id",
    // WWW-Authenticate is not CORS-safelisted, so a browser-side client cannot
    // read the challenge that tells it how to authenticate unless it is
    // exposed. Without this the discovery hook is invisible to exactly the
    // clients that most need it.
    "access-control-expose-headers": "WWW-Authenticate",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function rpcError(
  id: JsonRpcId | null,
  status: number,
  error: JsonRpcErrorBody,
  origin: string | null,
  extraHeaders: Record<string, string> = {},
): Response {
  const body = { jsonrpc: "2.0", id, error };
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(origin), ...extraHeaders },
  });
}

function rpcResult(
  id: JsonRpcId,
  era: Era,
  result: Record<string, unknown>,
  origin: string | null,
): Response {
  // The modern era tags every result so a client can tell a completed result
  // from one that is asking for more input. Legacy schemas have no such field.
  const payload = era === "modern" ? { resultType: "complete", ...result } : result;
  const body = { jsonrpc: "2.0", id, result: payload };
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: { ...JSON_HEADERS, ...corsHeaders(origin) },
  });
}

// --- read tools ------------------------------------------------------------

type ClaimLD = Record<string, unknown>;

async function fetchAsset(deps: McpDeps, path: string, base: string): Promise<unknown | null> {
  const res = await deps.assets.fetch(new Request(new URL(path, base).toString()));
  if (!res.ok) return null;
  return (await res.json()) as unknown;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Trailing path segment of an `@id` IRI, e.g. `…/forecasts/F4` → `F4`. */
function shortId(iri: string): string {
  const segments = iri.split("/");
  return segments[segments.length - 1] || iri;
}

function toClaimSummary(claim: ClaimLD) {
  return {
    id: claim["aboard:id"],
    kind: claim["aboard:kind"],
    title: claim["schema:name"],
    domain: claim["aboard:domain"],
    confidence: claim["aboard:confidence"],
  };
}

async function runReadTool(
  op: ReadOp,
  args: Record<string, unknown>,
  deps: McpDeps,
  base: string,
): Promise<Record<string, unknown>> {
  const graphUnavailable = "The published graph could not be read. Try again shortly.";

  if (op === "get_graph") {
    const graph = await fetchAsset(deps, "/api/graph", base);
    return graph === null ? toolResult(graphUnavailable, true) : jsonToolResult(graph);
  }

  if (op === "list_claims") {
    const graph = (await fetchAsset(deps, "/api/graph", base)) as Record<string, unknown> | null;
    if (graph === null) return toolResult(graphUnavailable, true);
    const domain = typeof args.domain === "string" ? args.domain : null;
    let claims = asArray(graph["aboard:claims"]);
    if (domain !== null) claims = claims.filter((c) => c["aboard:domain"] === domain);
    return jsonToolResult({
      count: claims.length,
      domains: graph["aboard:domains"] ?? [],
      claims: claims.map(toClaimSummary),
    });
  }

  if (op === "get_claim") {
    const id = str(args.id);
    const claim = await fetchAsset(deps, `/api/claims/${encodeURIComponent(id)}`, base);
    if (claim === null) return toolResult(`No claim with id '${id}'.`, true);
    return jsonToolResult(claim);
  }

  if (op === "get_dossier") {
    const claimId = str(args.claim_id);
    const claim = (await fetchAsset(
      deps,
      `/api/claims/${encodeURIComponent(claimId)}`,
      base,
    )) as Record<string, unknown> | null;
    if (claim === null) return toolResult(`No claim with id '${claimId}'.`, true);
    const dossier = claim["aboard:dossier"];
    if (!dossier) return toolResult(`Claim '${claimId}' has no dossier.`, true);
    return jsonToolResult(dossier);
  }

  // get_forecast: try the id as a claim id first — the cheap, direct path —
  // then fall back to scanning the graph for a forecast of that id.
  const id = str(args.id);
  const claim = (await fetchAsset(
    deps,
    `/api/claims/${encodeURIComponent(id)}`,
    base,
  )) as Record<string, unknown> | null;
  if (claim !== null) {
    const forecasts = asArray(claim["aboard:forecasts"]);
    if (forecasts.length > 0) {
      return jsonToolResult({ resolvedBy: "claim-id", claimId: id, forecasts });
    }
  }

  const graph = (await fetchAsset(deps, "/api/graph", base)) as Record<string, unknown> | null;
  if (graph === null) return toolResult(graphUnavailable, true);
  const match = asArray(graph["aboard:forecasts"]).find(
    (f) => f["aboard:id"] === id || shortId(str(f["@id"])) === id,
  );
  if (!match) {
    return toolResult(
      `No forecast found for id '${id}' (tried as a claim id and as a forecast id).`,
      true,
    );
  }
  return jsonToolResult({ resolvedBy: "forecast-id", forecast: match });
}

// --- write tools -----------------------------------------------------------

/**
 * Render the proposal endpoint's reply as a tool result.
 *
 * A rejection is a tool *execution* error, not a protocol error: the field
 * paths come back verbatim so the model can fix its payload and retry, which is
 * exactly the case the spec reserves `isError` for.
 */
async function runWriteTool(
  tool: ToolDescriptor,
  args: Record<string, unknown>,
  deps: McpDeps,
): Promise<Record<string, unknown>> {
  if (tool.handler.kind !== "write") return toolResult("Not a write tool.", true);

  const { proposalKind, rationaleField } = tool.handler;
  const { [rationaleField]: rationale, ...payload } = args;

  const response = await deps.proposal({
    kind: proposalKind,
    payload,
    via: `MCP ${tool.name}`,
    // An absent rationale is left as an empty string so the envelope's own
    // validator produces the error, rather than this shell inventing one.
    rationale: typeof rationale === "string" ? rationale : "",
  });

  const body = (await response.json().catch(() => ({}))) as {
    id?: string;
    path?: string;
    pullRequest?: string;
    error?: {
      code?: string;
      message?: string;
      issues?: { path: string; message: string }[];
      retryAfterSeconds?: number;
    };
  };

  if (response.status === 201 && body.pullRequest && body.id && body.path) {
    const narrative = [
      `Proposed ${body.id} — pull request opened.`,
      ``,
      `  ${body.pullRequest}`,
      ``,
      `File: ${body.path}`,
      `It is NOT merged. A human reviews it, and CI (build, referential integrity, tests) must pass.`,
    ].join("\n");
    // The structured half is what the tool's outputSchema promises. `merged` is
    // a constant because the write path has no branch that sets it otherwise.
    return narratedToolResult(narrative, {
      proposalId: body.id,
      pullRequest: body.pullRequest,
      path: body.path,
      merged: false,
    });
  }

  const issues = body.error?.issues?.map((i) => `  - ${i.path || "(root)"}: ${i.message}`).join("\n");
  return toolResult(
    [
      `Proposal rejected (HTTP ${response.status}${body.error?.code ? `, ${body.error.code}` : ""}).`,
      body.error?.message ?? "",
      issues ? `\nFields that failed validation:\n${issues}` : "",
      // Credential failures are answered before a tool ever runs, with an HTTP
      // challenge the client can act on. Reaching here means the two checks
      // disagreed, so say that rather than repeating the auth instructions.
      response.status === 401 || response.status === 403
        ? "\nThe credential was accepted by the endpoint and refused by the write path. This is a server bug; please report it."
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    true,
  );
}

// --- the endpoint ----------------------------------------------------------

async function execute(plan: Extract<McpPlan, { kind: "call" }>, deps: McpDeps, base: string) {
  return plan.tool.handler.kind === "read"
    ? runReadTool(plan.tool.handler.op, plan.args, deps, base)
    : runWriteTool(plan.tool, plan.args, deps);
}

export async function handleMcp(request: Request, deps: McpDeps): Promise<Response> {
  const origin = request.headers.get("origin");

  // Required of every Streamable HTTP server: an Origin that is present and not
  // ours is refused before anything else happens.
  if (!isAllowedOrigin(origin, request.url)) {
    return rpcError(null, 403, { code: INTERNAL_ERROR, message: "Origin not allowed." }, null);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  // Raised before the body is read, so a client that has to authenticate
  // learns it from the handshake rather than from its first write. Preflight
  // is already answered above: a 401 there would break CORS for everyone.
  if (deps.authRequired) {
    const outcome = authorizeWrite(await deps.credential(), deps.challengeOptions);
    if (!outcome.allowed) {
      const { status, error, description, wwwAuthenticate } = outcome.challenge;
      // A rejected or under-scoped token is described accurately by
      // authorizeWrite whatever asked. Absent credentials are not: here the
      // caller has not reached a write tool, so say what this URL wants and
      // where the public one is.
      const message = error
        ? description
        : `This URL challenges at the handshake because it was opened with ?auth=required. Send an Authorization: Bearer credential, or use ${RESOURCE_URI}, where the five read tools are public.`;
      return new Response(
        JSON.stringify(
          {
            jsonrpc: "2.0",
            id: null,
            error: { code: INTERNAL_ERROR, message, data: error ? { error } : undefined },
          },
          null,
          2,
        ),
        {
          status,
          headers: {
            ...JSON_HEADERS,
            "www-authenticate": wwwAuthenticate,
            ...corsHeaders(origin),
          },
        },
      );
    }
  }

  // The modern era dropped the GET stream and the DELETE session teardown, and
  // this server never had either. 405 is the prescribed answer to both.
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify(
        {
          jsonrpc: "2.0",
          id: null,
          error: {
            code: INTERNAL_ERROR,
            message: "The MCP endpoint accepts POST only: this server is stateless, with no SSE stream and no session to delete.",
          },
        },
        null,
        2,
      ),
      { status: 405, headers: { ...JSON_HEADERS, allow: "POST, OPTIONS", ...corsHeaders(origin) } },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return rpcError(null, 400, { code: PARSE_ERROR, message: "Request body is not valid JSON." }, origin);
  }

  const plan = planMessage(raw, request.headers);

  if (plan.kind === "accepted") {
    return new Response(null, { status: 202, headers: corsHeaders(origin) });
  }
  if (plan.kind === "error") {
    return rpcError(plan.id, plan.status, plan.error, origin);
  }
  if (plan.kind === "result") {
    return rpcResult(plan.id, plan.era, plan.result, origin);
  }

  // Resources are the published JSON-LD, so they are public exactly as the read
  // tools are: no credential is asked for here. A URI that resolved but whose
  // document is absent (an id that names no claim) is the same -32002 the
  // protocol layer raises for a URI that never resolved.
  if (plan.kind === "resource") {
    const document = await fetchAsset(deps, plan.path, request.url);
    if (document === null) {
      return rpcError(plan.id, 200, {
        code: RESOURCE_NOT_FOUND,
        message: `No resource at '${plan.uri}'.`,
        data: { uri: plan.uri },
      }, origin);
    }
    return rpcResult(plan.id, plan.era, resourceResult(plan.uri, document), origin);
  }

  // Count the call before authorization, so a rejected write still registers
  // as usage. The who-dimension is credential presence, not validity — read
  // tools never resolve a credential, and a KV lookup just to label a row
  // would end the anonymous read path's touches-no-storage property.
  deps.record?.(mcpCallEvent(plan.tool.name, request.headers.has("authorization")));

  // A write tool needs a credential, and a missing or insufficient one is a
  // transport-level answer rather than a tool result. The client, not the
  // model, is what has to act on it: a 401 carrying `WWW-Authenticate` is what
  // starts an OAuth flow, where an `isError` tool result would just be prose a
  // model cannot act on. Validation failures stay tool errors (see runWriteTool).
  if (plan.tool.handler.kind === "write") {
    const outcome = authorizeWrite(await deps.credential(), deps.challengeOptions);
    if (!outcome.allowed) {
      const { status, error, description, wwwAuthenticate } = outcome.challenge;
      return rpcError(
        plan.id,
        status,
        { code: INTERNAL_ERROR, message: description, data: error ? { error } : undefined },
        origin,
        { "www-authenticate": wwwAuthenticate },
      );
    }
  }

  try {
    const result = await execute(plan, deps, request.url);
    return rpcResult(plan.id, plan.era, result, origin);
  } catch (err) {
    return rpcError(
      plan.id,
      500,
      { code: INTERNAL_ERROR, message: `Tool execution failed: ${(err as Error).message}` },
      origin,
    );
  }
}
