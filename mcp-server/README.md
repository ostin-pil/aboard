# aboard / mcp-server

A [Model Context Protocol](https://modelcontextprotocol.io) server over
stdio for the [aboard](../) claim graph. Independent of the Next.js app —
has its own `package.json` and dependencies, like [`clients/`](../clients).

It consumes the published JSON-LD API (`/api/graph`, `/api/claims/{id}`)
exactly the way the `clients/` reference adapters do. It does **not** read
`data/` or share code with the app, so it runs from any machine that can
reach an aboard instance.

## Tools

### Read (live)

| Tool | Args | Returns |
|---|---|---|
| `list_claims` | `domain?: string` | Compact `{id, kind, title, domain, confidence}` summaries, optionally filtered by domain. |
| `get_claim` | `id: string` | Full claim JSON-LD: sources, observations, author, incoming/outgoing edges, attached forecasts, dossier. |
| `get_graph` | — | The full claim graph JSON-LD (all domains), verbatim. |
| `get_forecast` | `id: string` | Forecasts for a claim id, or one forecast by forecast id (resolved by scanning the graph — the API has no forecast endpoint). |
| `get_dossier` | `claim_id: string` | The dual-dossier debate embedded in that claim's response. |

### Write

| Tool | Status |
| --- | --- |
| `propose_claim` | **Wired.** Opens a real pull request. |
| `propose_edge` | Declared, not yet wired. |
| `propose_forecast_prediction` | Declared, not yet wired. |
| `propose_dossier_position` | Declared, not yet wired. |

`propose_claim` POSTs to the deployed `/api/proposals` endpoint, which validates
the payload against aboard's canonical Zod schemas, stamps provenance from your
agent token, commits the claim file, and opens a pull request. **It never
merges** — a human is the admission gate and CI must pass.

The claim's `id`, `createdAt`, and `authoredBy` are stamped **server-side**. Do
not send them; an attribution a caller asserts about itself carries no
information. At least one real source is required.

Set two environment variables:

```
ABOARD_API_BASE_URL=https://aboard.untype.me
ABOARD_AGENT_TOKEN=<token issued by the aboard operator>
```

Without a token the tool declines rather than guessing. This server holds no
GitHub credential and never touches `data/` — it is a thin client of the HTTP
endpoint, which any agent can call directly, MCP or not. See
[`worker/README.md`](../worker/README.md) for the endpoint contract, including
the structured `422` rejection path that names the exact fields that failed.

The other three tools are serialization variants of the same pipeline and land
next; each returns a message directing the caller to the PR-pack flow in
[`CONTRIBUTING.md`](../CONTRIBUTING.md).

## Install

```bash
cd mcp-server
npm install
```

Dependencies (`@modelcontextprotocol/sdk`, `zod`, plus `tsx` /
`typescript` / `@types/node` for dev) install into
`mcp-server/node_modules`. The main app's `package.json` and
`node_modules` are untouched.

## Configuration

| Env var | Default | Meaning |
|---|---|---|
| `ABOARD_API_BASE_URL` | `http://localhost:3000` | Base URL of the aboard instance to read from. A trailing slash is tolerated. |

## Run (stdio)

The server speaks MCP over stdio: it reads JSON-RPC frames on stdin and
writes them on stdout. **stdout is reserved for the protocol** — all
diagnostics go to stderr.

```bash
# default — reads from http://localhost:3000
npx tsx src/index.ts

# point at a deployed instance
ABOARD_API_BASE_URL=https://aboard.example.com npx tsx src/index.ts
```

The aboard dev server must be reachable for the read tools to return data
(`npm run dev` from the repo root for the default base URL). The MCP
server itself starts even if aboard is down; read calls then return a
clear "could not reach aboard API" error.

### MCP client config

Most MCP clients (Claude Desktop, Claude Code, etc.) launch servers from a
JSON config. Example entry:

```json
{
  "mcpServers": {
    "aboard": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "/absolute/path/to/aboard/mcp-server",
      "env": { "ABOARD_API_BASE_URL": "http://localhost:3000" }
    }
  }
}
```

## Smoke note

Type-check (the only build gate):

```bash
cd mcp-server
npx tsc --noEmit      # clean
```

Manual stdio handshake — initialize, then list tools — without an MCP
client. Pipe three JSON-RPC lines into the server and inspect stdout:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | npx tsx src/index.ts
```

You should see two JSON-RPC responses on stdout: the `initialize` result
(`serverInfo.name` = `aboard-mcp-server`) and a `tools/list` result naming
all nine tools. The `ready on stdio` line appears on stderr, not stdout.
With aboard running, a follow-up `tools/call` for `list_claims` returns the
claim summaries.

## Why this is its own package

Same rationale as `clients/`: the main app is a Next.js service whose
dependency tree (React, Tailwind, Next types) is irrelevant to an MCP
server. Splitting it out keeps the agent-facing surface small, models how
an external integrator would actually consume the API, and lets the server
run anywhere that can reach the JSON-LD endpoints.

## Known limitations

- Read-only in practice. Write tools are stubs until the PR-opening path
  ships.
- No caching — every tool call hits the API fresh (matches `clients/`
  simplicity; the graph is small).
- `get_forecast` resolves a forecast id by scanning `/api/graph`, since
  the aboard API exposes no per-forecast endpoint. A claim id is the
  faster path (direct `/api/claims/{id}`).
- No retry/timeout on the HTTP fetch, consistent with `clients/`.
