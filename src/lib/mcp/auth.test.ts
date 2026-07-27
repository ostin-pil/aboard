import { describe, expect, it } from "vitest";
import {
  PROPOSE_SCOPE,
  RESOURCE_METADATA_URL,
  RESOURCE_URI,
  audienceMatches,
  authorizeWrite,
  bearerChallenge,
  parseBearer,
  parseScopes,
  protectedResourceMetadata,
  resolveStaticIdentity,
  type Credential,
} from "@/lib/mcp/auth";
import type { TokenIdentity } from "@/lib/proposals";

const identity: TokenIdentity = {
  tokenId: "t1",
  operator: "ostin-pil",
  agent: "claude-opus-5",
  agentId: "aboard-cli",
};

/** Pull the quoted value of one auth-param out of a header. */
function param(header: string, name: string): string | null {
  const match = new RegExp(`${name}="([^"]*)"`).exec(header);
  return match ? match[1] : null;
}

describe("parsing a credential off the request", () => {
  it("accepts the Bearer scheme case-insensitively", () => {
    expect(parseBearer("Bearer abc")).toBe("abc");
    expect(parseBearer("bearer abc")).toBe("abc");
    expect(parseBearer("BEARER abc")).toBe("abc");
    expect(parseBearer("  Bearer   abc  ")).toBe("abc");
  });

  it("rejects everything that is not a bearer token", () => {
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer(undefined)).toBeNull();
    expect(parseBearer("")).toBeNull();
    expect(parseBearer("Basic abc")).toBeNull();
    expect(parseBearer("Bearer")).toBeNull();
    expect(parseBearer("Bearer   ")).toBeNull();
  });

  it("splits scopes on whitespace and drops empties", () => {
    expect(parseScopes("aboard:propose")).toEqual(["aboard:propose"]);
    expect(parseScopes("  a   b  ")).toEqual(["a", "b"]);
    expect(parseScopes("")).toEqual([]);
    expect(parseScopes(null)).toEqual([]);
    expect(parseScopes(undefined)).toEqual([]);
  });
});

describe("the static token table", () => {
  const table = JSON.stringify({ "secret-1": identity });

  it("resolves a known token", () => {
    expect(resolveStaticIdentity("secret-1", table)).toEqual(identity);
  });

  it("returns null for an unknown token", () => {
    expect(resolveStaticIdentity("nope", table)).toBeNull();
  });

  it("fails closed on an unset or malformed table rather than throwing", () => {
    expect(resolveStaticIdentity("secret-1", undefined)).toBeNull();
    expect(resolveStaticIdentity("secret-1", "")).toBeNull();
    expect(resolveStaticIdentity("secret-1", "{not json")).toBeNull();
  });
});

describe("audience validation", () => {
  it("accepts a token our own server minted with no resource bound", () => {
    // unwrapToken only resolves tokens from our own KV, so an absent audience
    // is ours by construction.
    expect(audienceMatches(undefined)).toBe(true);
    expect(audienceMatches([])).toBe(true);
  });

  it("accepts an audience naming this server", () => {
    expect(audienceMatches(RESOURCE_URI)).toBe(true);
    expect(audienceMatches([RESOURCE_URI])).toBe(true);
    expect(audienceMatches(["https://elsewhere.example/mcp", RESOURCE_URI])).toBe(true);
  });

  it("normalizes case and a trailing slash the way RFC 8707 expects", () => {
    expect(audienceMatches(`${RESOURCE_URI}/`)).toBe(true);
    expect(audienceMatches("HTTPS://ABOARD.UNTYPE.ME/mcp")).toBe(true);
  });

  it("rejects an audience naming a different resource", () => {
    expect(audienceMatches("https://elsewhere.example/mcp")).toBe(false);
    expect(audienceMatches("https://aboard.untype.me/api/proposals")).toBe(false);
    expect(audienceMatches("not a uri")).toBe(false);
  });
});

describe("authorizing a write", () => {
  it("challenges an anonymous caller with a 401 and no error code", () => {
    const outcome = authorizeWrite({ kind: "none" });
    if (outcome.allowed) throw new Error("expected a challenge");

    expect(outcome.challenge.status).toBe(401);
    // RFC 6750 section 3: a request carrying no authentication at all SHOULD
    // NOT get an error code back.
    expect(outcome.challenge.error).toBeUndefined();
    expect(outcome.challenge.wwwAuthenticate).not.toContain("error=");
    expect(param(outcome.challenge.wwwAuthenticate, "resource_metadata")).toBe(
      RESOURCE_METADATA_URL,
    );
    expect(param(outcome.challenge.wwwAuthenticate, "scope")).toBe(PROPOSE_SCOPE);
  });

  it("challenges a bad credential with a 401 and invalid_token", () => {
    const outcome = authorizeWrite({ kind: "invalid", reason: "Token expired." });
    if (outcome.allowed) throw new Error("expected a challenge");

    expect(outcome.challenge.status).toBe(401);
    expect(outcome.challenge.error).toBe("invalid_token");
    expect(param(outcome.challenge.wwwAuthenticate, "error")).toBe("invalid_token");
    expect(param(outcome.challenge.wwwAuthenticate, "error_description")).toBe("Token expired.");
    expect(param(outcome.challenge.wwwAuthenticate, "resource_metadata")).toBe(
      RESOURCE_METADATA_URL,
    );
  });

  it("lets a static agent token through, keyed on its token id", () => {
    const outcome = authorizeWrite({ kind: "static", identity });
    if (!outcome.allowed) throw new Error("expected an allow");

    expect(outcome.identity).toEqual(identity);
    expect(outcome.rateLimitKey).toBe("proposal:t1");
  });

  it("lets a scoped OAuth token through, keyed on its subject", () => {
    const credential: Credential = {
      kind: "oauth",
      identity,
      subject: "github:12345",
      scopes: [PROPOSE_SCOPE],
    };
    const outcome = authorizeWrite(credential);
    if (!outcome.allowed) throw new Error("expected an allow");

    expect(outcome.identity).toEqual(identity);
    expect(outcome.rateLimitKey).toBe("proposal:github:12345");
  });

  it("challenges an OAuth token missing the scope with a 403", () => {
    const credential: Credential = {
      kind: "oauth",
      identity,
      subject: "github:12345",
      scopes: ["aboard:read"],
    };
    const outcome = authorizeWrite(credential);
    if (outcome.allowed) throw new Error("expected a challenge");

    expect(outcome.challenge.status).toBe(403);
    expect(outcome.challenge.error).toBe("insufficient_scope");
    expect(param(outcome.challenge.wwwAuthenticate, "error")).toBe("insufficient_scope");
    // The challenge is authoritative for the current request, so it names the
    // scope the call actually needs.
    expect(param(outcome.challenge.wwwAuthenticate, "scope")).toBe(PROPOSE_SCOPE);
    expect(param(outcome.challenge.wwwAuthenticate, "resource_metadata")).toBe(
      RESOURCE_METADATA_URL,
    );
  });

  it("challenges a token carrying no scopes at all", () => {
    const outcome = authorizeWrite({
      kind: "oauth",
      identity,
      subject: "github:1",
      scopes: [],
    });
    expect(outcome.allowed).toBe(false);
  });
});

describe("the WWW-Authenticate value", () => {
  it("always carries resource_metadata, which is the discovery hook", () => {
    expect(bearerChallenge({})).toBe(`Bearer resource_metadata="${RESOURCE_METADATA_URL}"`);
  });

  it("orders params with the error first, as the spec examples do", () => {
    const header = bearerChallenge({ error: "insufficient_scope", scope: "a" });
    expect(header).toBe(
      `Bearer error="insufficient_scope", scope="a", resource_metadata="${RESOURCE_METADATA_URL}"`,
    );
  });

  it("omits the discovery hints when there is no authorization server", () => {
    // A resource_metadata pointer to a 404 is worse than no pointer: a
    // conforming client fetches it, fails, and has nothing to fall back on.
    expect(bearerChallenge({ scope: PROPOSE_SCOPE, discovery: false })).toBe("Bearer");
    expect(bearerChallenge({ error: "invalid_token", discovery: false })).toBe(
      'Bearer error="invalid_token"',
    );
  });

  it("still challenges with a 401 when discovery is off", () => {
    const outcome = authorizeWrite({ kind: "none" }, { discovery: false });
    if (outcome.allowed) throw new Error("expected a challenge");
    expect(outcome.challenge.status).toBe(401);
    expect(outcome.challenge.wwwAuthenticate).toBe("Bearer");
    expect(outcome.challenge.wwwAuthenticate).not.toContain("resource_metadata");
  });

  it("strips quotes and newlines that would truncate the header", () => {
    const header = bearerChallenge({
      error: "invalid_token",
      errorDescription: 'he said "no"\nand left',
    });
    expect(param(header, "error_description")).toBe("he said no and left");
    // The header stays parseable: resource_metadata survives intact.
    expect(param(header, "resource_metadata")).toBe(RESOURCE_METADATA_URL);
  });
});

describe("the protected resource metadata document", () => {
  const doc = protectedResourceMetadata();

  it("names this endpoint as the resource, without a trailing slash", () => {
    expect(doc.resource).toBe("https://aboard.untype.me/mcp");
  });

  it("names at least one authorization server, which MCP requires", () => {
    expect(Array.isArray(doc.authorization_servers)).toBe(true);
    expect((doc.authorization_servers as string[]).length).toBeGreaterThan(0);
  });

  it("advertises only the propose scope, and never offline_access", () => {
    expect(doc.scopes_supported).toEqual([PROPOSE_SCOPE]);
    expect(JSON.stringify(doc)).not.toContain("offline_access");
  });

  it("accepts the token in the header only", () => {
    expect(doc.bearer_methods_supported).toEqual(["header"]);
  });
});
