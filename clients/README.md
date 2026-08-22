# aboard / clients

Reference adapters for the [aboard](../) JSON-LD API. Independent of the Next.js app — has its own `package.json` and dependencies.

These adapters exist to prove two things:

1. The published v0 schema (`research/schema.md` + `public/schema/v0.json`) actually validates the responses served at `/api/graph` and `/api/claims/{id}`. If `validate.ts` says **OK**, the schema and the code agree.
2. The agent-readable JSON-LD round-trips cleanly back into a human-readable briefing without bespoke scraping. `briefing.ts` is that round-trip.

Anything new on top of the schema should pick a third concern (e.g. live calibration tracking, cross-domain ingestion).

## Not published to npm

Deliberately, and unlike [`mcp-server/`](../mcp-server), which is published as `aboard-mcp-server`. Session 67 settled this rather than leaving `private: true` to be read as an oversight.

The distribution story the audit's M4 item complains about is entirely the MCP server's: the root README, `CONTRIBUTING.md` and the registry card all name `aboard-mcp-server`, so a reader who follows any of them hits a package that has to exist. Nothing advertises `aboard-clients`, so publishing it closes no gap anyone can walk into.

What an outside consumer needs in order to check aboard's output is the schema, and that is already published at a stable URL any JSON Schema validator can read. These two adapters wrap ajv in a way that is worth copying and not worth depending on: a published name would imply an API stability that "reference adapter" is meant to disclaim.

Publishing is cheap if that ever changes — drop `allowImportingTsExtensions`, emit to `dist/` the way `mcp-server/tsconfig.json` now does, and add `bin` entries. The package embeds no schema (see the loader below), so it would not have to version in lockstep with one that is still in flux.

## Install

```bash
cd clients
npm install
```

The adapter pulls a small dependency tree (`ajv`, `ajv-formats`, `tsx`, `typescript`, `@types/node`) into `clients/node_modules`. It does not modify the main app's `package.json` or share its `node_modules`.

## Run

The aboard dev server must be running on `http://localhost:3000` (the default). Start it from the repo root with `npm run dev` if it isn't already.

### `validate.ts`

Fetches a JSON-LD response and validates it against `public/schema/v0.json`. Works for both response shapes (`/api/graph` and `/api/claims/{id}`).

```bash
# default — full graph
npx tsx validate.ts

# explicit
npx tsx validate.ts http://localhost:3000/api/graph

# single claim
npx tsx validate.ts http://localhost:3000/api/claims/M4

# remote deployment (works against any aboard instance)
npx tsx validate.ts https://aboard.untype.me/api/graph
```

Output:

- `OK — N claims, M edges, K forecasts, J dossiers, latest filed YYYY-MM-DD` for a graph response, or
- `OK — single claim, N incoming, M outgoing, K forecast(s), [no | 1] dossier` for a claim response,
- `INVALID` followed by per-error diagnostics if the response does not validate. Exit code is `0` on success, `1` on any failure.

### `briefing.ts`

Fetches the graph, validates, and renders a Markdown briefing on stdout.

```bash
# print to terminal
npx tsx briefing.ts

# save to file
npx tsx briefing.ts > briefing.md

# remote
npx tsx briefing.ts https://aboard.untype.me/api/graph > briefing.md
```

The briefing covers: domain, all symptoms with confidence and source-count, all mechanisms with attached-forecast count and dossier presence, all leverage points with confidence, every forecast (question, resolution date, criteria, every prediction), and every dossier (contested claim title, pro thesis, con thesis, top crux ranked by impact × uncertainty).

A non-validating response refuses to render — `briefing.ts` does **not** fall back to best-effort parsing. Treat schema conformance as a gate.

## Why this is its own package

The main app is a Next.js 16 web service. Its `package.json` is full of React 19, Tailwind 4, eslint-config-next, next types — none of which a schema validator needs. Splitting the adapter out:

- Keeps the consumer-side dependency surface small (just `ajv` + `ajv-formats`).
- Models how an external integrator would actually use the schema — pull the JSON Schema, validate, do something useful.
- Lets `validate.ts` and `briefing.ts` run from any machine that can reach the API, with no Next.js install.

## Known limitations

- `briefing.ts` only works against `/api/graph` (the full-graph response). Single-claim responses validate fine but don't have a briefing renderer.
- The schema loader looks for the local `public/schema/v0.json` first (so it works against unreleased schema changes), then falls back to fetching `{origin}/schema/v0.json` over HTTP. Both paths work. This note used to say the HTTP one did not exist as a route, which stopped being true when the app moved to `output: "export"`: `public/schema/v0.json` is copied to `out/schema/v0.json` and served as a static asset. Verified in session 67 against the deploy, which answers `200 application/json`.
- No retry / timeout on the HTTP fetch. If the server hangs, the script hangs.
- No CLI flag handling beyond a single positional URL argument. Add `commander` or similar if/when richer flags are needed.
