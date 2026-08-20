/**
 * The MCP endpoint's IO shell (`handleMcp`), with every dependency injected.
 * The protocol decisions (era detection, header mirroring, plan shapes) are
 * `src/lib/mcp/protocol.test.ts`'s job; this suite pins what the shell does
 * with a plan: the anonymous read path and its touches-no-storage property,
 * the telemetry point per tools/call, the transport-level auth answers, and
 * the origin/method gates. Messages use the legacy era (no version header),
 * which is the shape an ordinary stdio-bridged client sends.
 */
import { describe, expect, it, vi } from "vitest";
import { handleMcp, type McpDeps } from "./mcp";

const ORIGIN = "https://aboard.untype.me";

const GRAPH_FIXTURE = {
  "aboard:domains": ["democratic_backsliding"],
  "aboard:claims": [
    {
      "aboard:id": "M4",
      "aboard:kind": "mechanism",
      "schema:name": "A mechanism",
      "aboard:domain": "democratic_backsliding",
      "aboard:confidence": 0.6,
    },
  ],
};

const assets: McpDeps["assets"] = {
  fetch: async (request: Request) => {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/graph") return Response.json(GRAPH_FIXTURE);
    return new Response("not found", { status: 404 });
  },
};

const IDENTITY = {
  tokenId: "claude-test",
  operator: "ostin-pil",
  agent: "test-agent",
  agentId: "test-agent-1",
};

function makeDeps(overrides: Partial<McpDeps> = {}) {
  const record = vi.fn();
  const proposal = vi.fn(async () =>
    Response.json(
      { id: "M9", path: "data/x/claims/M9.md", pullRequest: "https://github.com/x/pull/1" },
      { status: 201 },
    ),
  );
  const credential = vi.fn(async () => ({ kind: "none" }) as const);
  const deps: McpDeps = {
    assets,
    credential,
    challengeOptions: { discovery: false },
    proposal,
    record,
    ...overrides,
  };
  return { deps, record, proposal, credential };
}

function rpc(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function call(name: string, args: Record<string, unknown> = {}) {
  return { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } };
}

describe("anonymous reads", () => {
  it("answers list_claims without ever resolving a credential", async () => {
    const { deps, credential, record } = makeDeps();

    const res = await handleMcp(rpc(call("list_claims")), deps);
    const body = (await res.json()) as {
      result: { content: { text: string }[] };
    };

    expect(res.status).toBe(200);
    expect(JSON.parse(body.result.content[0].text).count).toBe(1);
    expect(credential).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith({
      indexes: ["mcp_call"],
      blobs: ["list_claims", "anonymous"],
    });
  });

  it("labels a call credentialed from header presence alone", async () => {
    const { deps, record } = makeDeps();

    await handleMcp(rpc(call("list_claims"), { authorization: "Bearer whatever" }), deps);

    expect(record).toHaveBeenCalledWith({
      indexes: ["mcp_call"],
      blobs: ["list_claims", "credentialed"],
    });
  });
});

describe("write tools at the transport level", () => {
  it("answers an uncredentialed write with a 401 challenge, after counting the call", async () => {
    const { deps, record, proposal } = makeDeps();

    const res = await handleMcp(rpc(call("propose_claim", { rationale: "r" })), deps);

    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
    expect(proposal).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith({
      indexes: ["mcp_call"],
      blobs: ["propose_claim", "anonymous"],
    });
  });

  it("routes a credentialed write through the injected proposal pipeline", async () => {
    const { deps, proposal } = makeDeps({
      credential: async () => ({ kind: "static", identity: IDENTITY }) as const,
    });

    const res = await handleMcp(rpc(call("propose_claim", { rationale: "r" })), deps);
    const body = (await res.json()) as { result: { structuredContent: { merged: boolean } } };

    expect(res.status).toBe(200);
    expect(proposal).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "claim", via: "MCP propose_claim", rationale: "r" }),
    );
    expect(body.result.structuredContent.merged).toBe(false);
  });
});

describe("the transport gates", () => {
  it("refuses a foreign Origin before anything else", async () => {
    const { deps, record } = makeDeps();

    const res = await handleMcp(
      rpc(call("list_claims"), { origin: "https://evil.example" }),
      deps,
    );

    expect(res.status).toBe(403);
    expect(record).not.toHaveBeenCalled();
  });

  it("answers preflight with 204 and the CORS contract", async () => {
    const { deps } = makeDeps();

    const res = await handleMcp(
      new Request(`${ORIGIN}/mcp`, { method: "OPTIONS", headers: { origin: ORIGIN } }),
      deps,
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-expose-headers")).toBe("WWW-Authenticate");
  });

  it("answers GET with 405 and names the allowed methods", async () => {
    const { deps } = makeDeps();

    const res = await handleMcp(new Request(`${ORIGIN}/mcp`), deps);

    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST, OPTIONS");
  });

  it("answers a non-JSON body with a -32700 parse error", async () => {
    const { deps } = makeDeps();

    const res = await handleMcp(
      new Request(`${ORIGIN}/mcp`, { method: "POST", body: "{nope" }),
      deps,
    );
    const body = (await res.json()) as { error: { code: number } };

    expect(res.status).toBe(400);
    expect(body.error.code).toBe(-32700);
  });

  it("challenges at the handshake when opened with auth=required", async () => {
    const { deps } = makeDeps({ authRequired: true });

    const res = await handleMcp(rpc(call("list_claims")), deps);

    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
  });
});
