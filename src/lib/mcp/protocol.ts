/**
 * The MCP endpoint's protocol layer: JSON-RPC parsing, era detection, version
 * negotiation, and the decision about what a given message should produce.
 *
 * Everything here is pure — no network, no clock, no environment — so the
 * Worker that fronts it stays a thin shell and the wire behaviour is
 * unit-testable. Same split as the write path (`src/lib/proposals.ts`).
 *
 * ## Two eras, one endpoint
 *
 * MCP revision `2026-07-28` removed the `initialize` handshake and the
 * protocol-level session. Versions up to `2025-11-25` require them. The spec
 * calls a server that answers both "dual-era" and explicitly permits serving
 * them concurrently on one endpoint, selecting on how the client opens:
 *
 * - an `initialize` request selects legacy semantics;
 * - a request carrying `_meta.io.modelcontextprotocol/protocolVersion` (or a
 *   modern `MCP-Protocol-Version` header) is served as modern.
 *
 * Dual-era is nearly free here because aboard's server is stateless by nature:
 * it never opens a session, never initiates a request, and never needs input
 * mid-call, so the mechanisms `2026-07-28` removed were unused, and the ones it
 * added (multi round-trip requests) never fire. What the modern era does cost
 * is header validation: `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` are
 * mirrored from the body so intermediaries can route without parsing it, and a
 * server MUST reject a request whose headers and body disagree.
 *
 * Serving both is the point: no shipping client speaks `2026-07-28` yet, and
 * every client will eventually.
 */
import {
  RESOURCE_MIME_TYPE,
  resolveResourceUri,
  resourceListing,
  resourceTemplateListing,
} from "@/lib/mcp/resources";
import { findTool, toolListing, type ToolDescriptor } from "@/lib/mcp/tools";
import { CANONICAL_ORIGIN } from "@/lib/site";

export const MODERN_PROTOCOL_VERSION = "2026-07-28";
export const LATEST_LEGACY_PROTOCOL_VERSION = "2025-11-25";

/** Newest first — the order the `supported` list is advertised in. */
export const SUPPORTED_PROTOCOL_VERSIONS = [
  MODERN_PROTOCOL_VERSION,
  LATEST_LEGACY_PROTOCOL_VERSION,
  "2025-06-18",
  "2025-03-26",
] as const;

/** Mirrors `version` in package.json. */
export const SERVER_VERSION = "0.1.0";

/** `CANONICAL_ORIGIN` rather than `siteBaseUrl()`: the origin literal stays in
 *  its single source (`canonical-urls.test.ts` enforces that), and the Worker
 *  bundle gains no `process.env` read, which it has no runtime for. A deployed
 *  Worker only ever answers on the canonical origin anyway. */
const SERVER_INFO = {
  name: "aboard",
  title: "aboard",
  version: SERVER_VERSION,
  websiteUrl: CANONICAL_ORIGIN,
} as const;

/** Shown to a model when it connects. Says what the substrate is and what the
 *  write posture is, because both change how an agent should use the tools. */
const SERVER_INSTRUCTIONS =
  "aboard is a board of falsifiable claims about systemic problems: claims linked by " +
  "causal edges, time-boxed forecasts, and steel-manned dual dossiers with ranked cruxes. " +
  "Read tools are public and need no credential. The four propose_* tools require an " +
  "Authorization: Bearer agent token; each one opens a pull request against the repository " +
  "and NEVER merges — a human reviews it and CI must pass. Ids, timestamps and authorship " +
  "are stamped server-side from the token, so do not send them. Sources must be real URLs " +
  "that resolve to a real landing page.";

// --- JSON-RPC --------------------------------------------------------------

export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;
/** MCP-allocated: the URI in a `resources/read` names nothing this server serves. */
export const RESOURCE_NOT_FOUND = -32002;
/** MCP-allocated: headers do not match the body, or a required one is missing. */
export const HEADER_MISMATCH = -32020;
/** MCP-allocated: carries the server's supported versions in `data.supported`. */
export const UNSUPPORTED_PROTOCOL_VERSION = -32022;

export type JsonRpcId = string | number;

export type JsonRpcErrorBody = {
  code: number;
  message: string;
  data?: Record<string, unknown>;
};

export type Era = "modern" | "legacy";

/** Anything that answers `get(name)` case-insensitively — `Headers` does. */
export type HeaderReader = { get(name: string): string | null };

const META_KEY = "io.modelcontextprotocol/protocolVersion";

export type ParsedMessage =
  | { type: "request"; id: JsonRpcId; method: string; params: Record<string, unknown> }
  | { type: "notification"; method: string; params: Record<string, unknown> }
  /** A JSON-RPC response from the client. We never send requests, so this is
   *  never expected; acknowledging beats erroring. */
  | { type: "response" }
  | { type: "invalid"; message: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseMessage(raw: unknown): ParsedMessage {
  const body = asRecord(raw);
  if (!body) return { type: "invalid", message: "Request body must be a JSON-RPC object." };
  if (body.jsonrpc !== "2.0") {
    return { type: "invalid", message: 'Missing or invalid "jsonrpc": expected "2.0".' };
  }

  const method = body.method;
  if (typeof method !== "string") {
    // No method, but an id and a result/error: this is a response, not a request.
    if ("result" in body || "error" in body) return { type: "response" };
    return { type: "invalid", message: 'Missing "method".' };
  }

  const params = asRecord(body.params) ?? {};
  const id = body.id;
  if (id === undefined || id === null) return { type: "notification", method, params };
  if (typeof id !== "string" && typeof id !== "number") {
    return { type: "invalid", message: '"id" must be a string or a number.' };
  }
  return { type: "request", id, method, params };
}

// --- versions and eras -----------------------------------------------------

function isSupportedVersion(version: string): boolean {
  return (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(version);
}

/**
 * Is this a per-request-metadata ("modern") version?
 *
 * ISO dates sort lexicographically, so this is also true of any revision newer
 * than the one we implement. That is deliberate: a request naming a future
 * version is answered with `UnsupportedProtocolVersionError` and our supported
 * list, which is what lets the client retry with something we both speak. The
 * alternative — treating an unknown version as legacy — would silently answer
 * it under the wrong semantics.
 */
export function isModernVersion(version: string): boolean {
  return version >= MODERN_PROTOCOL_VERSION;
}

/** The version named in the body's `_meta`, if any. */
function metaProtocolVersion(params: Record<string, unknown>): string | null {
  const meta = asRecord(params._meta);
  const version = meta?.[META_KEY];
  return typeof version === "string" ? version : null;
}

export function detectEra(message: ParsedMessage, headers: HeaderReader): Era {
  if (message.type !== "request" && message.type !== "notification") return "legacy";
  // The handshake exists only in the legacy era, so asking for it selects it.
  if (message.method === "initialize") return "legacy";
  if (metaProtocolVersion(message.params) !== null) return "modern";
  const header = headers.get("mcp-protocol-version");
  return header !== null && isModernVersion(header) ? "modern" : "legacy";
}

/**
 * The version to answer a legacy `initialize` with: the client's own if we
 * speak it, otherwise the newest legacy version we speak. Never a modern
 * version — a client that opened with a handshake cannot speak one.
 */
export function negotiateLegacyVersion(requested: unknown): string {
  if (typeof requested === "string" && isSupportedVersion(requested) && !isModernVersion(requested)) {
    return requested;
  }
  return LATEST_LEGACY_PROTOCOL_VERSION;
}

// --- mirrored header validation (modern era) -------------------------------

const BASE64_SENTINEL = /^=\?base64\?(.*)\?=$/;

/** Header values that cannot be plain ASCII arrive base64-wrapped in a
 *  sentinel; a server MUST decode before comparing against the body. */
export function decodeHeaderValue(value: string): string {
  const wrapped = BASE64_SENTINEL.exec(value);
  if (!wrapped) return value;
  try {
    const binary = atob(wrapped[1]);
    return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return value;
  }
}

function mismatch(message: string): JsonRpcErrorBody {
  return { code: HEADER_MISMATCH, message };
}

/**
 * The modern era's server-side validation: every mirrored header must be
 * present and must agree with the body. The point is not ceremony — when a load
 * balancer routes on the header and the server executes on the body, a
 * disagreement between them is a security bug, so the spec requires rejecting
 * it rather than picking a winner.
 */
function validateModernHeaders(
  message: Extract<ParsedMessage, { type: "request" | "notification" }>,
  headers: HeaderReader,
): JsonRpcErrorBody | null {
  const headerVersion = headers.get("mcp-protocol-version");
  const bodyVersion = metaProtocolVersion(message.params);

  if (headerVersion === null) {
    return mismatch("Required header MCP-Protocol-Version is missing.");
  }
  if (bodyVersion === null) {
    return mismatch(
      `Required body field _meta["${META_KEY}"] is missing; it must match the ` +
        `MCP-Protocol-Version header ("${headerVersion}").`,
    );
  }
  if (headerVersion !== bodyVersion) {
    return mismatch(
      `Header mismatch: MCP-Protocol-Version header value "${headerVersion}" does not ` +
        `match body value "${bodyVersion}".`,
    );
  }

  const headerMethod = headers.get("mcp-method");
  if (headerMethod === null) return mismatch("Required header Mcp-Method is missing.");
  if (headerMethod !== message.method) {
    return mismatch(
      `Header mismatch: Mcp-Method header value "${headerMethod}" does not match body ` +
        `value "${message.method}".`,
    );
  }

  // Mcp-Name mirrors params.name, and is required only for the methods that
  // have one. Of those, this server implements tools/call.
  if (message.method === "tools/call") {
    const headerName = headers.get("mcp-name");
    if (headerName === null) return mismatch("Required header Mcp-Name is missing.");
    const bodyName = message.params.name;
    if (typeof bodyName !== "string" || decodeHeaderValue(headerName) !== bodyName) {
      return mismatch(
        `Header mismatch: Mcp-Name header value "${decodeHeaderValue(headerName)}" does ` +
          `not match body value "${typeof bodyName === "string" ? bodyName : ""}".`,
      );
    }
  }

  return null;
}

// --- results ---------------------------------------------------------------

/**
 * What this server offers.
 *
 * `tools` and `resources` only. No `listChanged` on either: the tool catalogue
 * is compiled in, the resource list is one entry, and this server opens no
 * stream to announce a change on. No `subscribe`, for the same reason. No
 * `prompts`, `logging` or `completions` — declaring a capability is a promise
 * to serve it, and a client MUST only use what was negotiated, so an empty
 * declaration would buy nothing but two wasted round-trips per connection.
 */
const CAPABILITIES = { tools: {}, resources: {} } as const;

function initializeResult(requestedVersion: unknown): Record<string, unknown> {
  return {
    protocolVersion: negotiateLegacyVersion(requestedVersion),
    capabilities: CAPABILITIES,
    serverInfo: SERVER_INFO,
    instructions: SERVER_INSTRUCTIONS,
  };
}

function discoverResult(): Record<string, unknown> {
  return {
    supportedVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
    capabilities: CAPABILITIES,
    instructions: SERVER_INSTRUCTIONS,
    _meta: {
      "io.modelcontextprotocol/serverInfo": {
        name: SERVER_INFO.name,
        version: SERVER_INFO.version,
      },
    },
  };
}

/** A tool result. `isError` carries actionable failures back to the model,
 *  which is what lets it correct a payload and retry. */
export function toolResult(text: string, isError = false): Record<string, unknown> {
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

/**
 * A tool result whose two halves say the same thing differently: prose written
 * for a reader, and structured data for a validator. Used where the useful
 * summary is not just the payload stringified.
 */
export function narratedToolResult(
  text: string,
  structured: Record<string, unknown>,
): Record<string, unknown> {
  return { content: [{ type: "text", text }], structuredContent: structured };
}

/**
 * A tool result carrying structured data.
 *
 * Both halves are sent. `structuredContent` is what a client validates against
 * the tool's `outputSchema`; the serialized copy in a text block is what the
 * spec asks for alongside it, so a client that predates structured content (or
 * a model reading the transcript directly) still sees the payload.
 */
export function jsonToolResult(payload: unknown): Record<string, unknown> {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

/** A `resources/read` result. The `uri` is echoed because a client may have
 *  read several and matches contents back to requests by it. */
export function resourceResult(uri: string, payload: unknown): Record<string, unknown> {
  return {
    contents: [
      { uri, mimeType: RESOURCE_MIME_TYPE, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

// --- planning --------------------------------------------------------------

/**
 * What the Worker should do with one message. Everything except `call` is
 * decided without touching the network.
 */
export type McpPlan =
  /** HTTP 202, no body: a notification or a stray client response. */
  | { kind: "accepted" }
  | { kind: "result"; id: JsonRpcId; era: Era; result: Record<string, unknown> }
  | { kind: "error"; id: JsonRpcId | null; era: Era; status: number; error: JsonRpcErrorBody }
  | {
      kind: "call";
      id: JsonRpcId;
      era: Era;
      tool: ToolDescriptor;
      /** Validated for read tools; passed through for writes, which are
       *  validated by the canonical schemas on the proposal path. */
      args: Record<string, unknown>;
    }
  /** A `resources/read` whose URI resolved. The Worker fetches `path` and
   *  echoes `uri` back in the contents, as the spec requires. */
  | { kind: "resource"; id: JsonRpcId; era: Era; uri: string; path: string };

function errorPlan(
  id: JsonRpcId | null,
  era: Era,
  status: number,
  error: JsonRpcErrorBody,
): McpPlan {
  return { kind: "error", id, era, status, error };
}

/** Zod issues → the compact, field-pathed shape a caller can act on. Same shape
 *  the write path returns, so an agent parses one error format across both. */
function issueLines(error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }): string {
  return error.issues
    .map((i) => `  - ${i.path.map(String).join(".") || "(root)"}: ${i.message}`)
    .join("\n");
}

export function planMessage(raw: unknown, headers: HeaderReader): McpPlan {
  const message = parseMessage(raw);

  if (message.type === "invalid") {
    return errorPlan(null, "legacy", 400, { code: INVALID_REQUEST, message: message.message });
  }
  if (message.type === "response") return { kind: "accepted" };

  const era = detectEra(message, headers);

  if (era === "modern") {
    const version = metaProtocolVersion(message.params) ?? headers.get("mcp-protocol-version") ?? "";
    if (!isSupportedVersion(version)) {
      return errorPlan(message.type === "request" ? message.id : null, era, 400, {
        code: UNSUPPORTED_PROTOCOL_VERSION,
        message: "Unsupported protocol version",
        data: { supported: [...SUPPORTED_PROTOCOL_VERSIONS], requested: version },
      });
    }
    const invalid = validateModernHeaders(message, headers);
    if (invalid) {
      return errorPlan(message.type === "request" ? message.id : null, era, 400, invalid);
    }
  }

  // A notification needs no answer. This server defines none of its own, and
  // the legacy era's `notifications/initialized` is pure ceremony to a stateless
  // server, so every notification is simply accepted.
  if (message.type === "notification") return { kind: "accepted" };

  const { id, method, params } = message;

  if (method === "initialize") {
    return { kind: "result", id, era, result: initializeResult(params.protocolVersion) };
  }
  if (method === "server/discover") {
    return { kind: "result", id, era, result: discoverResult() };
  }
  if (method === "ping") {
    return { kind: "result", id, era, result: {} };
  }
  if (method === "tools/list") {
    return { kind: "result", id, era, result: { tools: toolListing() } };
  }
  // Both listings fit in one page, so neither returns a `nextCursor`; its
  // absence is what tells a paginating client it has the whole list.
  if (method === "resources/list") {
    return { kind: "result", id, era, result: { resources: resourceListing() } };
  }
  if (method === "resources/templates/list") {
    return { kind: "result", id, era, result: { resourceTemplates: resourceTemplateListing() } };
  }
  if (method === "resources/read") {
    const uri = params.uri;
    if (typeof uri !== "string") {
      return errorPlan(id, era, 400, {
        code: INVALID_PARAMS,
        message: 'resources/read requires a string "uri".',
      });
    }
    const path = resolveResourceUri(uri);
    if (path === null) {
      // HTTP 200, not 404: the method routed and ran, and this is its answer.
      // A 404 here would be indistinguishable from the modern era's
      // "no such method" below, which is a different thing entirely.
      return errorPlan(id, era, 200, {
        code: RESOURCE_NOT_FOUND,
        message: `No resource at '${uri}'.`,
        data: {
          uri,
          known: resourceListing().map((r) => r.uri),
          templates: resourceTemplateListing().map((t) => t.uriTemplate),
        },
      });
    }
    return { kind: "resource", id, era, uri, path };
  }
  if (method === "tools/call") {
    const name = params.name;
    if (typeof name !== "string") {
      return errorPlan(id, era, 400, {
        code: INVALID_PARAMS,
        message: 'tools/call requires a string "name".',
      });
    }
    const tool = findTool(name);
    if (!tool) {
      return errorPlan(id, era, 400, {
        code: INVALID_PARAMS,
        message: `Unknown tool: ${name}`,
        data: { available: toolListing().map((t) => t.name) },
      });
    }

    const args = asRecord(params.arguments) ?? {};

    // Read arguments are validated here. Write arguments are not: they are
    // validated by the canonical payload schemas on the proposal path, and
    // validating them twice would be two definitions of a valid proposal.
    if (tool.handler.kind === "read") {
      const parsed = tool.args.safeParse(args);
      if (!parsed.success) {
        return {
          kind: "result",
          id,
          era,
          result: toolResult(
            `Invalid arguments for ${name}:\n${issueLines(parsed.error)}`,
            true,
          ),
        };
      }
      return { kind: "call", id, era, tool, args: parsed.data as Record<string, unknown> };
    }

    return { kind: "call", id, era, tool, args };
  }

  // Modern servers answer an unimplemented method with HTTP 404 so a client can
  // tell it apart from a legacy endpoint that is not there at all.
  return errorPlan(id, era, era === "modern" ? 404 : 200, {
    code: METHOD_NOT_FOUND,
    message: `Method not found: ${method}`,
  });
}

// --- origin ----------------------------------------------------------------

/**
 * DNS-rebinding guard. The spec requires rejecting a request whose `Origin` is
 * present and invalid; agent clients (Claude, ChatGPT, IDEs, the Inspector's
 * proxy) call server-side and send none at all.
 *
 * Same-origin and loopback are allowed so local tooling works. A browser page on
 * some other origin is refused here rather than served: everything the read
 * tools expose is already available to it, CORS-open, at `/api/graph`.
 */
export function isAllowedOrigin(origin: string | null, requestUrl: string): boolean {
  if (origin === null || origin === "" || origin === "null") return true;
  let candidate: URL;
  let target: URL;
  try {
    candidate = new URL(origin);
    target = new URL(requestUrl);
  } catch {
    return false;
  }
  if (candidate.origin === target.origin) return true;
  return candidate.hostname === "localhost" || candidate.hostname === "127.0.0.1";
}
