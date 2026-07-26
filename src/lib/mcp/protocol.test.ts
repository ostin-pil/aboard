import { describe, expect, it } from "vitest";
import {
  HEADER_MISMATCH,
  INVALID_PARAMS,
  INVALID_REQUEST,
  METHOD_NOT_FOUND,
  MODERN_PROTOCOL_VERSION,
  LATEST_LEGACY_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  UNSUPPORTED_PROTOCOL_VERSION,
  decodeHeaderValue,
  detectEra,
  isAllowedOrigin,
  isModernVersion,
  negotiateLegacyVersion,
  parseMessage,
  planMessage,
  type HeaderReader,
  type McpPlan,
} from "@/lib/mcp/protocol";

/** A case-insensitive header bag, the way `Headers` behaves. */
function headers(entries: Record<string, string> = {}): HeaderReader {
  const lower = new Map(Object.entries(entries).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name: string) => lower.get(name.toLowerCase()) ?? null };
}

const META = "io.modelcontextprotocol/protocolVersion";

/** A well-formed modern request: body `_meta` and every mirrored header. */
function modern(method: string, params: Record<string, unknown> = {}) {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method,
    params: { ...params, _meta: { [META]: MODERN_PROTOCOL_VERSION } },
  };
  const headerBag: Record<string, string> = {
    "mcp-protocol-version": MODERN_PROTOCOL_VERSION,
    "mcp-method": method,
  };
  if (method === "tools/call" && typeof params.name === "string") {
    headerBag["mcp-name"] = params.name;
  }
  return { body, headers: headers(headerBag) };
}

function expectError(plan: McpPlan): Extract<McpPlan, { kind: "error" }> {
  if (plan.kind !== "error") throw new Error(`expected an error plan, got ${plan.kind}`);
  return plan;
}

function expectResult(plan: McpPlan): Extract<McpPlan, { kind: "result" }> {
  if (plan.kind !== "result") throw new Error(`expected a result plan, got ${plan.kind}`);
  return plan;
}

describe("parseMessage", () => {
  it("reads a request, a notification, and a client response", () => {
    expect(parseMessage({ jsonrpc: "2.0", id: 1, method: "ping" })).toMatchObject({
      type: "request",
      id: 1,
      method: "ping",
    });
    expect(parseMessage({ jsonrpc: "2.0", method: "notifications/initialized" })).toMatchObject({
      type: "notification",
    });
    expect(parseMessage({ jsonrpc: "2.0", id: 1, result: {} })).toMatchObject({ type: "response" });
  });

  it("treats a null id as a notification, per JSON-RPC", () => {
    expect(parseMessage({ jsonrpc: "2.0", id: null, method: "ping" })).toMatchObject({
      type: "notification",
    });
  });

  it("rejects a body that is not a JSON-RPC 2.0 object", () => {
    expect(parseMessage("nope").type).toBe("invalid");
    expect(parseMessage([]).type).toBe("invalid");
    expect(parseMessage({ id: 1, method: "ping" }).type).toBe("invalid");
    expect(parseMessage({ jsonrpc: "1.0", id: 1, method: "ping" }).type).toBe("invalid");
    expect(parseMessage({ jsonrpc: "2.0", id: 1 }).type).toBe("invalid");
    expect(parseMessage({ jsonrpc: "2.0", id: {}, method: "ping" }).type).toBe("invalid");
  });
});

describe("era detection", () => {
  it("treats an initialize request as legacy — the handshake exists only there", () => {
    const message = parseMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    expect(detectEra(message, headers())).toBe("legacy");
    // Even when the client also sends a modern header.
    expect(detectEra(message, headers({ "mcp-protocol-version": MODERN_PROTOCOL_VERSION }))).toBe(
      "legacy",
    );
  });

  it("treats per-request _meta as modern", () => {
    const message = parseMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: { _meta: { [META]: MODERN_PROTOCOL_VERSION } },
    });
    expect(detectEra(message, headers())).toBe("modern");
  });

  it("treats a modern protocol header as modern", () => {
    const message = parseMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(detectEra(message, headers({ "mcp-protocol-version": MODERN_PROTOCOL_VERSION }))).toBe(
      "modern",
    );
  });

  it("treats a post-handshake legacy request as legacy", () => {
    const message = parseMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(detectEra(message, headers({ "mcp-protocol-version": "2025-11-25" }))).toBe("legacy");
    expect(detectEra(message, headers())).toBe("legacy");
  });

  it("counts a revision newer than ours as modern, so it gets a version error not wrong semantics", () => {
    expect(isModernVersion("2027-01-01")).toBe(true);
    expect(isModernVersion(MODERN_PROTOCOL_VERSION)).toBe(true);
    expect(isModernVersion(LATEST_LEGACY_PROTOCOL_VERSION)).toBe(false);
    expect(isModernVersion("2025-03-26")).toBe(false);
  });
});

describe("legacy version negotiation", () => {
  it("echoes a legacy version it supports", () => {
    expect(negotiateLegacyVersion("2025-11-25")).toBe("2025-11-25");
    expect(negotiateLegacyVersion("2025-06-18")).toBe("2025-06-18");
    expect(negotiateLegacyVersion("2025-03-26")).toBe("2025-03-26");
  });

  it("falls back to the newest legacy version for anything else", () => {
    expect(negotiateLegacyVersion("1900-01-01")).toBe(LATEST_LEGACY_PROTOCOL_VERSION);
    expect(negotiateLegacyVersion(undefined)).toBe(LATEST_LEGACY_PROTOCOL_VERSION);
    expect(negotiateLegacyVersion(7)).toBe(LATEST_LEGACY_PROTOCOL_VERSION);
  });

  it("never answers a handshake with a modern version, which has no handshake", () => {
    expect(negotiateLegacyVersion(MODERN_PROTOCOL_VERSION)).toBe(LATEST_LEGACY_PROTOCOL_VERSION);
  });
});

describe("mirrored header validation (modern era)", () => {
  it("accepts a well-formed modern request", () => {
    const { body, headers: h } = modern("tools/list");
    expect(planMessage(body, h).kind).toBe("result");
  });

  it("rejects a missing MCP-Protocol-Version header", () => {
    const { body } = modern("tools/list");
    const plan = expectError(planMessage(body, headers({ "mcp-method": "tools/list" })));
    expect(plan.error.code).toBe(HEADER_MISMATCH);
    expect(plan.status).toBe(400);
  });

  it("rejects a header that disagrees with the body", () => {
    const { body } = modern("tools/list");
    const plan = expectError(
      planMessage(
        body,
        headers({ "mcp-protocol-version": "2025-11-25", "mcp-method": "tools/list" }),
      ),
    );
    // The header names a legacy version while the body names a modern one:
    // caught as a mismatch, which is the security-relevant failure.
    expect(plan.error.code).toBe(HEADER_MISMATCH);
  });

  it("rejects a missing or mismatched Mcp-Method", () => {
    const { body } = modern("tools/list");
    const missing = expectError(
      planMessage(body, headers({ "mcp-protocol-version": MODERN_PROTOCOL_VERSION })),
    );
    expect(missing.error.message).toMatch(/Mcp-Method/);

    const wrong = expectError(
      planMessage(
        body,
        headers({ "mcp-protocol-version": MODERN_PROTOCOL_VERSION, "mcp-method": "tools/call" }),
      ),
    );
    expect(wrong.error.code).toBe(HEADER_MISMATCH);
  });

  it("requires Mcp-Name on tools/call and matches it against the body", () => {
    const { body } = modern("tools/call", { name: "get_graph", arguments: {} });

    const missing = expectError(
      planMessage(
        body,
        headers({ "mcp-protocol-version": MODERN_PROTOCOL_VERSION, "mcp-method": "tools/call" }),
      ),
    );
    expect(missing.error.message).toMatch(/Mcp-Name/);

    const wrong = expectError(
      planMessage(
        body,
        headers({
          "mcp-protocol-version": MODERN_PROTOCOL_VERSION,
          "mcp-method": "tools/call",
          "mcp-name": "get_claim",
        }),
      ),
    );
    expect(wrong.error.code).toBe(HEADER_MISMATCH);
  });

  it("decodes a base64-sentinel header value before comparing it", () => {
    expect(decodeHeaderValue("plain")).toBe("plain");
    expect(decodeHeaderValue("=?base64?SGVsbG8sIOS4lueVjA==?=")).toBe("Hello, 世界");
    // Undecodable content is left alone rather than throwing.
    expect(decodeHeaderValue("=?base64?!!!?=")).toBe("=?base64?!!!?=");

    const { body } = modern("tools/call", { name: "get_graph", arguments: {} });
    const plan = planMessage(
      body,
      headers({
        "mcp-protocol-version": MODERN_PROTOCOL_VERSION,
        "mcp-method": "tools/call",
        "mcp-name": "=?base64?Z2V0X2dyYXBo?=", // "get_graph"
      }),
    );
    expect(plan.kind).toBe("call");
  });

  it("does not apply header validation to legacy requests", () => {
    // A legacy client sends none of these headers, and must still be served.
    const plan = planMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }, headers());
    expect(plan.kind).toBe("result");
  });
});

describe("protocol version support", () => {
  it("rejects a version it does not implement, and says what it does", () => {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: { _meta: { [META]: "2099-01-01" } },
    };
    const plan = expectError(
      planMessage(body, headers({ "mcp-protocol-version": "2099-01-01", "mcp-method": "tools/list" })),
    );
    expect(plan.error.code).toBe(UNSUPPORTED_PROTOCOL_VERSION);
    expect(plan.status).toBe(400);
    expect(plan.error.data).toEqual({
      supported: [...SUPPORTED_PROTOCOL_VERSIONS],
      requested: "2099-01-01",
    });
  });
});

describe("planMessage", () => {
  it("answers a legacy initialize with the negotiated version and the tools capability", () => {
    const plan = expectResult(
      planMessage(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x" } },
        },
        headers(),
      ),
    );
    expect(plan.era).toBe("legacy");
    expect(plan.result.protocolVersion).toBe("2025-06-18");
    expect(plan.result.capabilities).toEqual({ tools: {} });
    expect(plan.result.serverInfo).toMatchObject({ name: "aboard" });
    expect(typeof plan.result.instructions).toBe("string");
  });

  it("acknowledges every notification", () => {
    expect(planMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, headers()).kind).toBe(
      "accepted",
    );
    expect(planMessage({ jsonrpc: "2.0", method: "notifications/cancelled" }, headers()).kind).toBe(
      "accepted",
    );
  });

  it("answers ping with an empty result", () => {
    expect(expectResult(planMessage({ jsonrpc: "2.0", id: 2, method: "ping" }, headers())).result).toEqual(
      {},
    );
  });

  it("answers server/discover with its supported versions", () => {
    const { body, headers: h } = modern("server/discover");
    const plan = expectResult(planMessage(body, h));
    expect(plan.result.supportedVersions).toEqual([...SUPPORTED_PROTOCOL_VERSIONS]);
    expect(plan.result.capabilities).toEqual({ tools: {} });
  });

  it("lists all nine tools", () => {
    const plan = expectResult(planMessage({ jsonrpc: "2.0", id: 3, method: "tools/list" }, headers()));
    expect((plan.result.tools as unknown[]).length).toBe(9);
  });

  it("reports an unknown method as -32601, with 404 in the modern era only", () => {
    const legacy = expectError(
      planMessage({ jsonrpc: "2.0", id: 4, method: "resources/list" }, headers()),
    );
    expect(legacy.error.code).toBe(METHOD_NOT_FOUND);
    expect(legacy.status).toBe(200);

    const { body, headers: h } = modern("resources/list");
    const mod = expectError(planMessage(body, h));
    expect(mod.error.code).toBe(METHOD_NOT_FOUND);
    expect(mod.status).toBe(404);
  });

  it("reports a malformed body as -32600", () => {
    expect(expectError(planMessage({ hello: "world" }, headers())).error.code).toBe(INVALID_REQUEST);
  });

  it("reports an unknown tool as a protocol error naming the ones that exist", () => {
    const plan = expectError(
      planMessage(
        { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "nope", arguments: {} } },
        headers(),
      ),
    );
    expect(plan.error.code).toBe(INVALID_PARAMS);
    expect((plan.error.data?.available as string[]).length).toBe(9);
  });
});

describe("tools/call argument handling", () => {
  it("plans a call for a valid read tool, with parsed arguments", () => {
    const plan = planMessage(
      {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: { name: "get_claim", arguments: { id: "M4" } },
      },
      headers(),
    );
    if (plan.kind !== "call") throw new Error("expected a call plan");
    expect(plan.tool.name).toBe("get_claim");
    expect(plan.args).toEqual({ id: "M4" });
  });

  it("returns bad read arguments as a tool error the model can correct", () => {
    const plan = expectResult(
      planMessage(
        { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "get_claim", arguments: {} } },
        headers(),
      ),
    );
    expect(plan.result.isError).toBe(true);
    const [content] = plan.result.content as { text: string }[];
    expect(content.text).toMatch(/Invalid arguments for get_claim/);
    expect(content.text).toMatch(/- id:/);
  });

  it("passes write arguments through unvalidated, so the canonical schema is the only judge", () => {
    const plan = planMessage(
      {
        jsonrpc: "2.0",
        id: 8,
        method: "tools/call",
        // Deliberately invalid: no sources, no rationale. The proposal path
        // rejects it with field paths; this layer must not pre-empt that.
        params: { name: "propose_claim", arguments: { domain: "inequality" } },
      },
      headers(),
    );
    if (plan.kind !== "call") throw new Error("expected a call plan");
    expect(plan.args).toEqual({ domain: "inequality" });
  });
});

describe("isAllowedOrigin", () => {
  const url = "https://aboard.untype.me/mcp";

  it("allows an absent origin — agent clients send none", () => {
    expect(isAllowedOrigin(null, url)).toBe(true);
    expect(isAllowedOrigin("", url)).toBe(true);
    expect(isAllowedOrigin("null", url)).toBe(true);
  });

  it("allows same-origin and loopback", () => {
    expect(isAllowedOrigin("https://aboard.untype.me", url)).toBe(true);
    expect(isAllowedOrigin("http://localhost:6274", url)).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:8787", url)).toBe(true);
  });

  it("refuses another site's origin, and anything unparseable", () => {
    expect(isAllowedOrigin("https://evil.example", url)).toBe(false);
    expect(isAllowedOrigin("https://aboard.untype.me.evil.example", url)).toBe(false);
    expect(isAllowedOrigin("not a url", url)).toBe(false);
  });
});
