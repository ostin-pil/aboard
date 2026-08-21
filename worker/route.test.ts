/**
 * The Worker's HTTP shell, driven through `route()` with every binding faked:
 * the assets fetch serves fixtures, the limiter and analytics dataset are
 * spies, and GitHub is a stubbed global fetch. Until session 64 this file's
 * surface (the write path's ordering, the size cap, the failure-path branch
 * cleanup, markdown negotiation, the telemetry seam) was reachable by no test
 * at all — U1 in `plans/audit-2026-08.md`.
 *
 * What stays out of scope here: the pure decisions these paths delegate to
 * (`proposals.ts`, `proposal-errors.ts`, `rate-limit.ts`, `telemetry.ts`,
 * `markdown-negotiation.ts`, `mcp/auth.ts`), which have their own suites, and
 * the OAuth provider wrapper, which is a third-party library.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

// `worker/oauth.ts` pulls in `@cloudflare/workers-oauth-provider`, which
// imports the `cloudflare:` protocol node cannot load. The wrapper is the one
// piece of this file's import graph that is not ours to test, so it is stubbed
// at the module boundary rather than aliased at the runtime one.
vi.mock("./oauth", () => ({
  withOAuth: (handler: unknown) => handler,
  whoamiResponse: () => new Response("{}", { status: 200 }),
}));

import { route, type Env } from "./index";
import { MAX_PROPOSAL_BYTES } from "../src/lib/proposals";

const ORIGIN = "https://aboard.untype.me";

/** The minimum of `/api/graph` that `readGraph` reads. */
const GRAPH_FIXTURE = {
  "aboard:claims": [
    { "aboard:id": "S1", "aboard:domain": "democratic_backsliding" },
    { "aboard:id": "M4", "aboard:domain": "democratic_backsliding" },
    { "aboard:id": "IS1", "aboard:domain": "inequality" },
  ],
  "aboard:edges": [{ "aboard:id": "E1" }],
  "aboard:forecasts": [
    { "aboard:id": "F7", "aboard:attachedTo": { "@id": `${ORIGIN}/claims/M4` } },
  ],
  "aboard:dossiers": [{ "aboard:attachedTo": { "@id": `${ORIGIN}/claims/M4` } }],
};

/** Fake assets binding: the graph, one Markdown twin, HTML for the rest. */
const assets: Env["ASSETS"] = {
  fetch: async (request: Request) => {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/graph") {
      return new Response(JSON.stringify(GRAPH_FIXTURE), {
        headers: { "content-type": "application/ld+json" },
      });
    }
    if (pathname === "/claims/M4/index.md") {
      return new Response("# M4 twin\n", { headers: { "content-type": "text/markdown" } });
    }
    if (pathname.endsWith("/index.md")) {
      return new Response("not found", { status: 404 });
    }
    return new Response("<html>static</html>", { headers: { "content-type": "text/html" } });
  },
};

const IDENTITY = {
  tokenId: "claude-test",
  operator: "ostin-pil",
  agent: "test-agent",
  agentId: "test-agent-1",
};

type EnvOverrides = Partial<Env> & { limiterAllows?: boolean };

function makeEnv(overrides: EnvOverrides = {}) {
  const { limiterAllows = true, ...rest } = overrides;
  const events = { writeDataPoint: vi.fn() };
  const limiter = { limit: vi.fn(async () => ({ success: limiterAllows })) };
  const env: Env = {
    ASSETS: assets,
    ABOARD_AGENT_TOKENS: JSON.stringify({ "tok-1": IDENTITY }),
    GITHUB_TOKEN: "gh-secret",
    GITHUB_REPO: "ostin-pil/aboard",
    PROPOSAL_LIMITER: limiter,
    EVENTS: events,
    ...rest,
  };
  return { env, events, limiter };
}

/**
 * Stub the global fetch that `gh()` uses. Overrides swap the response of one
 * named step; everything else answers with a green-path default. `calls`
 * records the sequence so tests can assert what was (and was not) asked of
 * GitHub.
 */
type GhOverrides = Partial<Record<"baseRef" | "createRef" | "commit" | "pr" | "getFile", Response>>;

function stubGitHub(overrides: GhOverrides = {}) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const stub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = url.replace("https://api.github.com/repos/ostin-pil/aboard", "");
    const method = init?.method ?? "GET";
    calls.push({
      method,
      path,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    if (method === "GET" && path.startsWith("/git/ref/heads/")) {
      return overrides.baseRef ?? Response.json({ object: { sha: "basesha" } });
    }
    if (method === "GET" && path.startsWith("/contents/")) {
      // The edge and prediction paths read their target file at the base ref
      // before appending. 404 (the file does not exist) is the default, which
      // is what an untouched fixture repo looks like.
      return overrides.getFile ?? Response.json({ message: "Not Found" }, { status: 404 });
    }
    if (method === "POST" && path === "/git/refs") {
      return overrides.createRef ?? Response.json({}, { status: 201 });
    }
    if (method === "PUT" && path.startsWith("/contents/")) {
      return overrides.commit ?? Response.json({}, { status: 201 });
    }
    if (method === "POST" && path === "/pulls") {
      return (
        overrides.pr ??
        Response.json({ html_url: "https://github.com/ostin-pil/aboard/pull/999" }, { status: 201 })
      );
    }
    if (method === "DELETE" && path.startsWith("/git/refs/heads/")) {
      return new Response(null, { status: 204 });
    }
    return Response.json({ message: `unstubbed ${method} ${path}` }, { status: 500 });
  });
  vi.stubGlobal("fetch", stub);
  return { calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const CLAIM_ENVELOPE = {
  kind: "claim",
  payload: {
    domain: "democratic_backsliding",
    kind: "mechanism",
    title: "A test mechanism",
    statement: "A falsifiable statement a distrustful reader could check.",
    confidence: 0.5,
    sources: [{ label: "A paper", url: "https://example.org/paper" }],
  },
  rationale: "Because the suite needs a valid proposal.",
};

function proposal(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/proposals`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const AUTH = { authorization: "Bearer tok-1" };

describe("the write path's check order (E14, deliberate)", () => {
  it("turns an uncredentialed caller away before the limiter or GitHub is touched", async () => {
    const { calls } = stubGitHub();
    const { env, events, limiter } = makeEnv();

    const res = await route(proposal(CLAIM_ENVELOPE), env);

    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
    expect(limiter.limit).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
    expect(events.writeDataPoint).toHaveBeenCalledWith({
      indexes: ["proposal"],
      blobs: ["unauthorized", "POST /api/proposals"],
    });
  });

  it("refuses an unknown token as 401 invalid_token", async () => {
    stubGitHub();
    const { env } = makeEnv();

    const res = await route(proposal(CLAIM_ENVELOPE, { authorization: "Bearer nope" }), env);
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });

  it("rate-limits a credentialed caller before GitHub, with the documented Retry-After", async () => {
    const { calls } = stubGitHub();
    const { env, events, limiter } = makeEnv({ limiterAllows: false });

    const res = await route(proposal(CLAIM_ENVELOPE, AUTH), env);

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(limiter.limit).toHaveBeenCalledWith({ key: "proposal:claude-test" });
    expect(calls).toEqual([]);
    expect(events.writeDataPoint).toHaveBeenCalledWith({
      indexes: ["proposal"],
      blobs: ["rate_limited", "POST /api/proposals"],
    });
  });

  it("answers 503 not_configured when the GitHub credential is absent", async () => {
    stubGitHub();
    const { env } = makeEnv({ GITHUB_TOKEN: undefined });

    const res = await route(proposal(CLAIM_ENVELOPE, AUTH), env);
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(503);
    expect(body.error.code).toBe("not_configured");
  });
});

describe("the proposal size cap", () => {
  it("rejects an honest oversize declaration from the header alone", async () => {
    const { calls } = stubGitHub();
    const { env } = makeEnv();

    const res = await route(
      proposal(CLAIM_ENVELOPE, { ...AUTH, "content-length": String(MAX_PROPOSAL_BYTES + 1) }),
      env,
    );
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(413);
    expect(body.error.code).toBe("payload_too_large");
    expect(calls).toEqual([]);
  });

  it("rejects an undeclared oversize body while reading it", async () => {
    stubGitHub();
    const { env } = makeEnv();
    const oversized = JSON.stringify({
      kind: "claim",
      payload: { pad: "x".repeat(MAX_PROPOSAL_BYTES + 1) },
      rationale: "r",
    });

    const res = await route(proposal(oversized, AUTH), env);
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(413);
    expect(body.error.code).toBe("payload_too_large");
  });

  it("rejects a body that is not JSON as 400", async () => {
    stubGitHub();
    const { env } = makeEnv();

    const res = await route(proposal("{not json", AUTH), env);
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("invalid_json");
  });

  it("rejects a malformed envelope as 422 with field paths", async () => {
    stubGitHub();
    const { env } = makeEnv();

    const res = await route(proposal({ kind: "claim", payload: {} }, AUTH), env);
    const body = (await res.json()) as {
      error: { code: string; issues: { path: string }[] };
    };

    expect(res.status).toBe(422);
    expect(body.error.code).toBe("invalid_envelope");
    expect(body.error.issues.some((i) => i.path === "rationale")).toBe(true);
  });
});

describe("a valid claim proposal", () => {
  it("opens a PR and records an accepted proposal event", async () => {
    const { calls } = stubGitHub();
    const { env, events } = makeEnv();

    const res = await route(proposal(CLAIM_ENVELOPE, AUTH), env);
    const body = (await res.json()) as { id: string; branch: string; pullRequest: string };

    expect(res.status).toBe(201);
    expect(body.pullRequest).toBe("https://github.com/ostin-pil/aboard/pull/999");
    expect(body.branch).toMatch(/^agent\/claude-test\//);
    expect(calls.map((c) => `${c.method} ${c.path.split("?")[0].split("/").slice(0, 3).join("/")}`)).toEqual([
      "GET /git/ref",
      "POST /git/refs",
      `PUT /contents/data`,
      "POST /pulls",
    ]);
    expect(events.writeDataPoint).toHaveBeenCalledWith({
      indexes: ["proposal"],
      blobs: ["accepted", "POST /api/proposals"],
    });
  });

  it("names the known domains when the payload's domain does not exist", async () => {
    stubGitHub();
    const { env } = makeEnv();
    const envelope = {
      ...CLAIM_ENVELOPE,
      payload: { ...CLAIM_ENVELOPE.payload, domain: "no_such_domain" },
    };

    const res = await route(proposal(envelope, AUTH), env);
    const body = (await res.json()) as { error: { code: string; knownDomains: string[] } };

    expect(res.status).toBe(422);
    expect(body.error.code).toBe("unknown_domain");
    expect(body.error.knownDomains).toEqual(["democratic_backsliding", "inequality"]);
  });
});

describe("edge collisions against the base ref (chunk 5)", () => {
  const EDGE_ENVELOPE = {
    kind: "edge",
    payload: { from: "M4", to: "S1", kind: "causes", strength: 0.6, sources: [] },
    rationale: "Because the suite needs a valid edge proposal.",
  };

  /** A `GET /contents/…` answer carrying this YAML as the file at the base ref. */
  function fileHolding(yaml: string): Response {
    return Response.json({
      sha: "filesha",
      content: Buffer.from(yaml, "utf8").toString("base64"),
    });
  }

  const EXISTING_RELATION = [
    "- id: E4",
    "  fromId: M4",
    "  toId: S1",
    "  kind: causes",
    "  strength: 0.55",
    "  rationale: The relation the graph already asserts.",
  ].join("\n");

  it("files an edge when the base-ref file holds neither the id nor the relation", async () => {
    const { calls } = stubGitHub({
      getFile: fileHolding(
        ["- id: E1", "  fromId: S1", "  toId: M4", "  kind: moderates", "  strength: 0.3", "  rationale: Unrelated."].join("\n"),
      ),
    });
    const { env } = makeEnv();

    const res = await route(proposal(EDGE_ENVELOPE, AUTH), env);
    const body = (await res.json()) as { status: string; id: string };

    expect(res.status).toBe(201);
    expect(body.status).toBe("proposed");
    // The graph fixture holds E1, so the mint continues past it.
    expect(body.id).toBe("E2");
    expect(calls.some((c) => c.method === "POST" && c.path === "/pulls")).toBe(true);
  });

  // The deploy-lag window, which for edges used to close only at CI on the PR.
  // `/api/graph` still shows E1 as the highest id, so the Worker mints E2 —
  // while `edges.yaml` on the base branch already holds an E2 that has not
  // deployed yet.
  it("refuses a stale minted id as 409 id_collision, before cutting a branch", async () => {
    const { calls } = stubGitHub({
      getFile: fileHolding(
        ["- id: E2", "  fromId: S1", "  toId: IS1", "  kind: causes", "  strength: 0.3", "  rationale: Landed but not deployed."].join("\n"),
      ),
    });
    const { env } = makeEnv();

    const res = await route(proposal(EDGE_ENVELOPE, AUTH), env);
    const body = (await res.json()) as {
      error: { code: string; retryable: boolean; remediation: string; path: string };
    };

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("id_collision");
    expect(body.error.retryable).toBe(true);
    expect(body.error.remediation).toContain("Re-read /api/graph");
    expect(body.error.path).toBe("data/democratic_backsliding/edges.yaml");
    // Nothing was created, so nothing needs cleaning up.
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("refuses a relation the base-ref file already asserts, naming the edge holding it", async () => {
    const { calls } = stubGitHub({ getFile: fileHolding(EXISTING_RELATION) });
    const { env } = makeEnv();

    const res = await route(proposal(EDGE_ENVELOPE, AUTH), env);
    const body = (await res.json()) as {
      error: { code: string; existingId: string; retryable: boolean };
    };

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("duplicate_relation");
    expect(body.error.existingId).toBe("E4");
    // Not retryable: filing it again under a fresh id would be a second edge
    // asserting the same thing, which no integrity check rejects.
    expect(body.error.retryable).toBe(false);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("refuses a duplicate the deployed graph already shows, without reading the file", async () => {
    const { calls } = stubGitHub();
    const { env } = makeEnv({
      ASSETS: {
        fetch: async (request: Request) => {
          if (new URL(request.url).pathname === "/api/graph") {
            return Response.json({
              ...GRAPH_FIXTURE,
              "aboard:edges": [
                {
                  "aboard:id": "E1",
                  "aboard:from": { "@id": `${ORIGIN}/claims/M4` },
                  "aboard:to": { "@id": `${ORIGIN}/claims/S1` },
                  "aboard:relation": "causes",
                },
              ],
            });
          }
          return new Response("<html>static</html>", {
            headers: { "content-type": "text/html" },
          });
        },
      } as Env["ASSETS"],
    });

    const res = await route(proposal(EDGE_ENVELOPE, AUTH), env);
    const body = (await res.json()) as { error: { code: string; existingId: string } };

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("duplicate_relation");
    expect(body.error.existingId).toBe("E1");
    // The graph answered it, so GitHub was never asked anything at all.
    expect(calls).toEqual([]);
  });

  it("allows the reverse direction over the same pair", async () => {
    stubGitHub({ getFile: fileHolding(EXISTING_RELATION) });
    const { env } = makeEnv();
    const reversed = {
      ...EDGE_ENVELOPE,
      payload: { ...EDGE_ENVELOPE.payload, from: "S1", to: "M4" },
    };

    const res = await route(proposal(reversed, AUTH), env);

    expect(res.status).toBe(201);
  });
});

describe("branch cleanup on failed submits (E13)", () => {
  it("deletes the branch when the commit is refused, and classifies the collision", async () => {
    const { calls } = stubGitHub({ commit: Response.json({}, { status: 422 }) });
    const { env } = makeEnv();

    const res = await route(proposal(CLAIM_ENVELOPE, AUTH), env);
    const body = (await res.json()) as { error: { code: string; retryable?: boolean } };

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("id_collision");

    const created = calls.find((c) => c.method === "POST" && c.path === "/git/refs");
    const branch = (created?.body as { ref: string }).ref.replace("refs/heads/", "");
    expect(calls).toContainEqual(
      expect.objectContaining({ method: "DELETE", path: `/git/refs/heads/${branch}` }),
    );
  });

  it("deletes the branch when the PR call fails", async () => {
    const { calls } = stubGitHub({ pr: Response.json({}, { status: 503 }) });
    const { env } = makeEnv();

    const res = await route(proposal(CLAIM_ENVELOPE, AUTH), env);
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(502);
    expect(body.error.code).toBe("github_failed");
    expect(calls.some((c) => c.method === "DELETE" && c.path.startsWith("/git/refs/heads/"))).toBe(
      true,
    );
  });
});

describe("markdown negotiation", () => {
  it("serves the twin, uncacheable and CORS-open, and records the twin event", async () => {
    const { env, events } = makeEnv();

    const res = await route(
      new Request(`${ORIGIN}/claims/M4`, { headers: { accept: "text/markdown" } }),
      env,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(res.headers.get("vary")).toBe("Accept");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("# M4 twin\n");
    expect(events.writeDataPoint).toHaveBeenCalledWith({
      indexes: ["twin"],
      blobs: ["/claims/M4"],
    });
  });

  it("answers HEAD with the twin's headers and no body", async () => {
    const { env } = makeEnv();

    const res = await route(
      new Request(`${ORIGIN}/claims/M4`, { method: "HEAD", headers: { accept: "text/markdown" } }),
      env,
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });

  it("falls through to the static site when no Markdown is preferred", async () => {
    const { env, events } = makeEnv();

    const res = await route(new Request(`${ORIGIN}/claims/M4`), env);

    expect(res.headers.get("content-type")).toContain("text/html");
    expect(events.writeDataPoint).not.toHaveBeenCalled();
  });

  it("falls through when the page has no built twin", async () => {
    const { env, events } = makeEnv();

    const res = await route(
      new Request(`${ORIGIN}/claims/S1`, { headers: { accept: "text/markdown" } }),
      env,
    );

    expect(res.headers.get("content-type")).toContain("text/html");
    expect(events.writeDataPoint).not.toHaveBeenCalled();
  });
});

describe("telemetry stays optional", () => {
  it("behaves identically with no dataset bound", async () => {
    stubGitHub();
    const { env } = makeEnv({ EVENTS: undefined });

    const res = await route(proposal(CLAIM_ENVELOPE, AUTH), env);

    expect(res.status).toBe(201);
  });
});
