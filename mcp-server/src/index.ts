#!/usr/bin/env -S npx tsx
/**
 * aboard MCP server — stdio transport.
 *
 * Exposes the aboard claim graph to any MCP-speaking agent. Read tools fetch
 * the published JSON-LD over HTTP (no local `data/` access, mirroring the
 * `clients/` reference adapters). Write tools post to `/api/proposals` on the
 * Worker, which opens a gated PR — nothing merges without human review. That
 * endpoint is Worker-only, so `ABOARD_API_BASE_URL` must point at a deploy that
 * serves it; `next dev` does not (see `http.ts`).
 *
 * Run over stdio:
 *
 *   npx tsx src/index.ts
 *
 * Point at a non-default aboard instance:
 *
 *   ABOARD_API_BASE_URL=https://aboard.example.com npx tsx src/index.ts
 *
 * stdout is reserved for the MCP protocol. All diagnostics go to stderr.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { baseUrl } from "./http.js";
import { registerReadTools } from "./tools/read.js";
import { registerWriteTools } from "./tools/write.js";

async function main(): Promise<void> {
  const server = new McpServer({
    name: "aboard-mcp-server",
    version: "0.1.0",
  });

  registerReadTools(server);
  registerWriteTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stderr only — stdout carries MCP protocol frames exclusively.
  process.stderr.write(
    `aboard-mcp-server ready on stdio (API base: ${baseUrl()})\n`
  );
}

main().catch((err: unknown) => {
  process.stderr.write(
    `aboard-mcp-server failed to start: ${(err as Error).message}\n`
  );
  process.exit(1);
});
