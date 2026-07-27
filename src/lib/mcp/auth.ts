/**
 * Who may call a write tool, and what to say when they may not.
 *
 * Pure, like the rest of `src/lib/mcp/` — no network, no clock, no
 * environment. The Worker resolves the two credential sources (a static token
 * table, and the OAuth provider's `unwrapToken`) and hands the result here;
 * this module decides, and renders the exact `WWW-Authenticate` value that
 * goes on the wire.
 *
 * ## Why the decision is per call rather than per endpoint
 *
 * The MCP authorization spec assumes a protected server. `/mcp` is half
 * public and stays that way: the five read tools project JSON-LD that is
 * already published to anyone who asks, and only the four `propose_*` tools
 * are gated. So a missing credential is not an error until a write is
 * actually attempted, and `tools/list` keeps listing all nine tools for
 * everyone. A client that cannot see the write tools has no reason to
 * authenticate; the 401 on first call is what teaches it how.
 *
 * ## Where the line between a 401 and a tool error falls
 *
 * Session 30 made proposal rejections tool-level errors so a model could read
 * the field paths and retry, which is what `isError` is for. That still
 * holds for anything the model can fix by editing its payload. A missing or
 * invalid credential is not that: it is something the *client* has to fix by
 * authenticating, and the transport layer already knows how to act on a 401
 * carrying `WWW-Authenticate`. Validation failures stay tool errors;
 * credential failures become status codes.
 */
import { CANONICAL_ORIGIN } from "@/lib/site";
import type { TokenIdentity } from "@/lib/proposals";

/** The only scope this server defines. Read needs none. */
export const PROPOSE_SCOPE = "aboard:propose";

/** The canonical URI of this MCP server, per RFC 8707 §2. No trailing slash:
 *  the spec asks for consistency and prefers the form without one. */
export const RESOURCE_URI = `${CANONICAL_ORIGIN}/mcp`;

/**
 * Where the Protected Resource Metadata document lives.
 *
 * RFC 9728 §3.1 makes the well-known URI path-aware: a resource at `/mcp`
 * publishes to `/.well-known/oauth-protected-resource/mcp`. Clients try that
 * first and the root form second, so both get served. Session 30 learned the
 * same shape of lesson with the server card, where four spellings of one
 * filename were in circulation.
 */
export const RESOURCE_METADATA_URL = `${CANONICAL_ORIGIN}/.well-known/oauth-protected-resource/mcp`;

/**
 * A credential as resolved from the request, before any decision is taken.
 *
 * `none` and `invalid` are separate because only the second is worth a log
 * line, and because RFC 6750 §3 says a response to a request carrying no
 * authentication at all SHOULD NOT include an error code. They produce
 * different headers.
 */
export type Credential =
  | { kind: "none" }
  | { kind: "invalid"; reason: string }
  | { kind: "static"; identity: TokenIdentity }
  | {
      kind: "oauth";
      identity: TokenIdentity;
      /** Stable subject the rate limiter keys on. */
      subject: string;
      scopes: string[];
    };

export type AuthChallenge = {
  status: 401 | 403;
  /** RFC 6750 error code, absent when the request carried no credential. */
  error?: "invalid_token" | "insufficient_scope";
  description: string;
  /** The literal header value. */
  wwwAuthenticate: string;
};

export type AuthOutcome =
  | { allowed: true; identity: TokenIdentity; rateLimitKey: string }
  | { allowed: false; challenge: AuthChallenge };

/**
 * Whether to advertise OAuth discovery in a challenge.
 *
 * `resource_metadata` points a client at a document that only exists once an
 * authorization server does, and a pointer to a 404 is worse than no pointer:
 * a conforming client will fetch it, fail, and have nothing to fall back on.
 * So a deployment with no OAuth configured still answers 401, still says
 * `Bearer`, and simply omits the discovery hints. That mirrors how
 * `/api/proposals` answers 503 `not_configured` rather than pretending, and it
 * is what lets this ship in stages.
 */
export type ChallengeOptions = { discovery: boolean };

// --- parsing ---------------------------------------------------------------

/** The bearer token from an Authorization header, or null. Case-insensitive
 *  scheme, per RFC 6750. */
export function parseBearer(header: string | null | undefined): string | null {
  const match = /^Bearer\s+(.+)$/i.exec((header ?? "").trim());
  return match ? match[1].trim() || null : null;
}

/** Split an OAuth `scope` string. Space-delimited per RFC 6749 §3.3. */
export function parseScopes(scope: string | null | undefined): string[] {
  return (scope ?? "").split(/\s+/).filter(Boolean);
}

/**
 * Look a static agent token up in the `ABOARD_AGENT_TOKENS` table.
 *
 * Takes the raw JSON so the parse is testable and so a malformed table fails
 * closed rather than throwing into the request path.
 */
export function resolveStaticIdentity(
  token: string,
  tableJson: string | undefined,
): TokenIdentity | null {
  if (!tableJson) return null;
  let table: Record<string, TokenIdentity>;
  try {
    table = JSON.parse(tableJson) as Record<string, TokenIdentity>;
  } catch {
    return null;
  }
  return table[token] ?? null;
}

/**
 * Whether a token our own authorization server minted was minted for us.
 *
 * `unwrapToken` only resolves tokens present in our own `OAUTH_KV`, so a
 * token that gets this far is ours by construction and an absent audience is
 * not suspicious. An audience that is present and names something else is:
 * that is a token the client asked to be scoped to a different resource, and
 * honouring it here is the audience-validation failure the spec forbids with
 * a MUST.
 */
export function audienceMatches(audience: string | string[] | undefined): boolean {
  if (audience === undefined) return true;
  const list = Array.isArray(audience) ? audience : [audience];
  if (list.length === 0) return true;
  return list.some((entry) => normalizeResource(entry) === RESOURCE_URI);
}

/** Compare resource URIs the way RFC 8707 expects: scheme and host are
 *  case-insensitive, a single trailing slash is not significant. */
function normalizeResource(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  try {
    const url = new URL(trimmed);
    const port = url.port ? `:${url.port}` : "";
    return `${url.protocol.toLowerCase()}//${url.hostname.toLowerCase()}${port}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return trimmed;
  }
}

// --- the decision ----------------------------------------------------------

/**
 * May this credential call a write tool?
 *
 * Read tools never reach here. The rate-limit key comes back with the
 * identity so one caller cannot multiply its burst allowance by holding both
 * a static token and an OAuth grant.
 */
export function authorizeWrite(
  credential: Credential,
  options: ChallengeOptions = { discovery: true },
): AuthOutcome {
  const { discovery } = options;

  switch (credential.kind) {
    case "none":
      return {
        allowed: false,
        challenge: {
          status: 401,
          description:
            "The four propose_* tools require a credential. Read tools need none.",
          wwwAuthenticate: bearerChallenge({ scope: PROPOSE_SCOPE, discovery }),
        },
      };

    case "invalid":
      return {
        allowed: false,
        challenge: {
          status: 401,
          error: "invalid_token",
          description: credential.reason,
          wwwAuthenticate: bearerChallenge({
            error: "invalid_token",
            errorDescription: credential.reason,
            scope: PROPOSE_SCOPE,
            discovery,
          }),
        },
      };

    case "static":
      // Static agent tokens predate OAuth and carry no scopes: holding one is
      // the grant. They stay the shipped contract for the generator script and
      // the stdio server.
      return {
        allowed: true,
        identity: credential.identity,
        rateLimitKey: `proposal:${credential.identity.tokenId}`,
      };

    case "oauth":
      if (!credential.scopes.includes(PROPOSE_SCOPE)) {
        const description = `This token does not carry the ${PROPOSE_SCOPE} scope.`;
        return {
          allowed: false,
          challenge: {
            status: 403,
            error: "insufficient_scope",
            description,
            wwwAuthenticate: bearerChallenge({
              error: "insufficient_scope",
              errorDescription: description,
              scope: PROPOSE_SCOPE,
              discovery,
            }),
          },
        };
      }
      return {
        allowed: true,
        identity: credential.identity,
        rateLimitKey: `proposal:${credential.subject}`,
      };
  }
}

/**
 * Render a `WWW-Authenticate` value.
 *
 * `resource_metadata` is always present: it is one of the two discovery
 * mechanisms the spec requires, and the one clients prefer when both exist.
 * `scope` is a SHOULD, and giving it means a client asks for exactly the
 * permission it needs instead of everything we support.
 */
export function bearerChallenge(params: {
  error?: "invalid_token" | "insufficient_scope";
  errorDescription?: string;
  scope?: string;
  /** Omit the discovery hints when no authorization server exists to find. */
  discovery?: boolean;
}): string {
  const discovery = params.discovery ?? true;
  const parts: string[] = [];
  if (params.error) parts.push(`error="${params.error}"`);
  if (params.errorDescription) {
    parts.push(`error_description="${quoteSafe(params.errorDescription)}"`);
  }
  if (discovery) {
    if (params.scope) parts.push(`scope="${quoteSafe(params.scope)}"`);
    parts.push(`resource_metadata="${RESOURCE_METADATA_URL}"`);
  }
  return parts.length ? `Bearer ${parts.join(", ")}` : "Bearer";
}

/** Header values are quoted strings, so a stray quote or backslash would end
 *  the value early. Drop them rather than escaping: nothing we emit needs
 *  either, and a mangled header is worse than a plainer message. */
function quoteSafe(value: string): string {
  return value.replace(/[\\"]/g, "").replace(/[\r\n]+/g, " ").trim();
}

// --- the metadata document -------------------------------------------------

/**
 * The RFC 9728 Protected Resource Metadata document.
 *
 * `authorization_servers` is optional in RFC 9728 and required by MCP, with
 * at least one entry, which is why this document could not ship ahead of the
 * authorization server. `offline_access` is deliberately absent from
 * `scopes_supported`: refresh tokens are a client concern, and the spec says
 * a resource server SHOULD NOT advertise it.
 */
export function protectedResourceMetadata(): Record<string, unknown> {
  return {
    resource: RESOURCE_URI,
    authorization_servers: [CANONICAL_ORIGIN],
    scopes_supported: [PROPOSE_SCOPE],
    bearer_methods_supported: ["header"],
    resource_documentation: `${CANONICAL_ORIGIN}/about`,
  };
}
