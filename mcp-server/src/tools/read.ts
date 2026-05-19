/**
 * Read tools. Each fetches the published JSON-LD over HTTP and returns it to
 * the caller. No local `data/` access — the API is the single source.
 *
 * Endpoint map (the aboard API only exposes `/api/graph` and
 * `/api/claims/{id}`):
 *   list_claims  → /api/graph, projected + filtered
 *   get_claim    → /api/claims/{id} (full claim incl. edges/forecasts/dossier)
 *   get_graph    → /api/graph (verbatim JSON-LD)
 *   get_forecast → /api/claims/{id} when given a claim id; else /api/graph
 *                  scanned by forecast id
 *   get_dossier  → /api/claims/{id}, returns the embedded aboard:dossier
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ApiError, fetchLD } from "../http.js";
import {
  type ClaimGraphLD,
  type ForecastLD,
  type FullClaimLD,
  shortId,
  toClaimSummary,
} from "../types.js";

type TextResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function ok(payload: unknown): TextResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

function fail(message: string): TextResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return `Unexpected error: ${(err as Error).message}`;
}

export function registerReadTools(server: McpServer): void {
  server.registerTool(
    "list_claims",
    {
      title: "List claims",
      description:
        "List every claim as a compact summary (id, kind, title, domain, " +
        "confidence). Optionally filter by domain (e.g. 'inequality', " +
        "'democratic_backsliding').",
      inputSchema: {
        domain: z
          .string()
          .optional()
          .describe("Restrict results to this domain. Omit for all domains."),
      },
    },
    async ({ domain }) => {
      try {
        const graph = await fetchLD<ClaimGraphLD>("/api/graph");
        let claims = graph["aboard:claims"] ?? [];
        if (domain) {
          claims = claims.filter((c) => c["aboard:domain"] === domain);
        }
        return ok({
          count: claims.length,
          domains: graph["aboard:domains"] ?? [],
          claims: claims.map(toClaimSummary),
        });
      } catch (err) {
        return fail(describeError(err));
      }
    }
  );

  server.registerTool(
    "get_claim",
    {
      title: "Get claim",
      description:
        "Fetch one claim by id (e.g. 'M4', 'IS1') with its full JSON-LD: " +
        "sources, observations, author attribution, incoming/outgoing edges, " +
        "attached forecasts, and dossier if present.",
      inputSchema: {
        id: z.string().describe("Claim id, e.g. 'M4' or 'IS1'."),
      },
    },
    async ({ id }) => {
      try {
        const claim = await fetchLD<FullClaimLD>(
          `/api/claims/${encodeURIComponent(id)}`
        );
        return ok(claim);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return fail(`No claim with id '${id}'.`);
        }
        return fail(describeError(err));
      }
    }
  );

  server.registerTool(
    "get_graph",
    {
      title: "Get graph",
      description:
        "Fetch the full claim graph as JSON-LD: every claim, edge, forecast, " +
        "and dossier across all domains. Verbatim API response.",
      inputSchema: {},
    },
    async () => {
      try {
        const graph = await fetchLD<ClaimGraphLD>("/api/graph");
        return ok(graph);
      } catch (err) {
        return fail(describeError(err));
      }
    }
  );

  server.registerTool(
    "get_forecast",
    {
      title: "Get forecast",
      description:
        "Fetch forecast(s). Pass a claim id (e.g. 'M4') to get all forecasts " +
        "attached to that claim, or a forecast id (e.g. 'F4') to get that one " +
        "forecast. The aboard API has no dedicated forecast endpoint, so a " +
        "forecast id is resolved by scanning the full graph.",
      inputSchema: {
        id: z
          .string()
          .describe("A claim id (e.g. 'M4') or a forecast id (e.g. 'F4')."),
      },
    },
    async ({ id }) => {
      try {
        // First treat `id` as a claim id — the cheap, direct path.
        try {
          const claim = await fetchLD<FullClaimLD>(
            `/api/claims/${encodeURIComponent(id)}`
          );
          const forecasts = claim["aboard:forecasts"] ?? [];
          if (forecasts.length > 0) {
            return ok({ resolvedBy: "claim-id", claimId: id, forecasts });
          }
          // Claim exists but has no forecasts — fall through to graph scan in
          // case `id` is actually a forecast id that collides with nothing.
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 404)) throw err;
          // Not a claim id; try the forecast-id path below.
        }

        const graph = await fetchLD<ClaimGraphLD>("/api/graph");
        const match = (graph["aboard:forecasts"] ?? []).find(
          (f: ForecastLD) =>
            f["aboard:id"] === id || shortId(f["@id"]) === id
        );
        if (!match) {
          return fail(
            `No forecast found for id '${id}' (tried as a claim id and as a ` +
              `forecast id).`
          );
        }
        return ok({ resolvedBy: "forecast-id", forecast: match });
      } catch (err) {
        return fail(describeError(err));
      }
    }
  );

  server.registerTool(
    "get_dossier",
    {
      title: "Get dossier",
      description:
        "Fetch the dual-dossier debate (pro/con arguments and ranked cruxes) " +
        "attached to a claim. Pass the contested claim's id (e.g. 'M4'). " +
        "Dossiers are embedded in the claim response under aboard:dossier.",
      inputSchema: {
        claim_id: z
          .string()
          .describe("Id of the claim the dossier is attached to."),
      },
    },
    async ({ claim_id }) => {
      try {
        const claim = await fetchLD<FullClaimLD>(
          `/api/claims/${encodeURIComponent(claim_id)}`
        );
        const dossier = claim["aboard:dossier"];
        if (!dossier) {
          return fail(`Claim '${claim_id}' has no dossier.`);
        }
        return ok(dossier);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return fail(`No claim with id '${claim_id}'.`);
        }
        return fail(describeError(err));
      }
    }
  );
}
