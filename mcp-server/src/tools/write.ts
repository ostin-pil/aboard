/**
 * Write tools.
 *
 * `propose_claim` is wired: it POSTs to the deployed `/api/proposals` endpoint,
 * which validates against the canonical Zod schemas, stamps provenance from the
 * agent token, and opens a pull request. It never merges — a human is the
 * admission gate, and CI must pass.
 *
 * The other three remain declared-but-stubbed so the surface stays discoverable.
 * They are serialization variants of the same pipeline and land next.
 *
 * This server holds no GitHub credential and never touches `data/`. It is a thin
 * client of the HTTP endpoint, which is the whole point: any agent can use that
 * endpoint directly, MCP or not.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { agentToken, postProposal, baseUrl, ApiError } from "../http.js";

type TextResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function text(body: string, isError = false): TextResult {
  return { content: [{ type: "text", text: body }], isError };
}

const NOT_WIRED =
  "This proposal kind is not wired yet. The gated write path itself IS built — " +
  "`propose_claim` files a real, Zod-validated, provenance-stamped pull request " +
  "through POST /api/proposals — but edges, predictions, and dossier positions " +
  "are serialization variants that land next. To file one today, use the PR-pack " +
  "flow in CONTRIBUTING.md: sketch in the /graph sandbox, export the PR pack, " +
  "clone the repo and unpack into data/<domain>/, fill in real Source citations " +
  "and DataPoint anchors, validate with `npx tsx clients/validate.ts` + " +
  "`npm run build`, then open a pull request.";

function notWired(): TextResult {
  return { content: [{ type: "text", text: NOT_WIRED }], isError: true };
}

// --- shared schema fragments (mirror src/lib/types.ts) ---

const sourceSchema = z.object({
  label: z.string(),
  url: z.string().url(),
  kind: z
    .enum([
      "dataset",
      "paper",
      "news",
      "policy",
      "book",
      "report",
      "court",
      "blog",
      "statute",
    ])
    .optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  authors: z.string().optional(),
  finding: z.string().optional(),
  excerpt: z.string().optional(),
});

const claimKind = z.enum(["symptom", "mechanism", "leverage_point"]);
const edgeKind = z.enum(["causes", "moderates", "reduces", "evidences"]);

export function registerWriteTools(server: McpServer): void {
  server.registerTool(
    "propose_claim",
    {
      title: "Propose a claim",
      description:
        "Opens a pull request adding one claim to data/<domain>/claims/. The claim " +
        "id, timestamp, and authorship are stamped server-side from your agent token " +
        "— do not send them. At least one real source is required. The PR is NEVER " +
        "auto-merged: a human reviews it and CI must pass. Requires ABOARD_AGENT_TOKEN.",
      inputSchema: {
        domain: z
          .string()
          .describe("Existing domain, e.g. 'inequality'. New domains need a human."),
        kind: claimKind,
        title: z.string(),
        statement: z.string().describe("The claim itself. Becomes the file body."),
        confidence: z.number().min(0).max(1),
        sources: z
          .array(sourceSchema)
          .min(1)
          .describe("At least one real source. URLs must resolve to a real landing page."),
        rationale: z
          .string()
          .describe("Why this claim belongs in the graph. Becomes the PR body."),
      },
    },
    async ({ rationale, ...payload }): Promise<TextResult> => {
      const token = agentToken();
      if (!token) {
        return text(
          "No ABOARD_AGENT_TOKEN is set, so this server cannot file a proposal. The token " +
            "is issued by the aboard operator and maps to the provenance stamped into the " +
            "filed content. Without one, use the PR-pack flow in CONTRIBUTING.md.",
          true
        );
      }

      let result;
      try {
        result = await postProposal({ kind: "claim", payload, rationale }, token);
      } catch (err) {
        const message = err instanceof ApiError ? err.message : String(err);
        return text(message, true);
      }

      const { status, body } = result;

      if (status === 201 && body.pullRequest) {
        return text(
          [
            `Proposed ${body.claimId} — pull request opened.`,
            ``,
            `  ${body.pullRequest}`,
            ``,
            `File: ${body.path}`,
            `It is NOT merged. A human reviews it, and CI (build, referential integrity, tests) must pass.`,
          ].join("\n")
        );
      }

      // The rejection path is the useful one: hand back the exact field paths so
      // the caller can fix its payload rather than guess.
      const issues = body.error?.issues
        ?.map((i) => `  - ${i.path || "(root)"}: ${i.message}`)
        .join("\n");

      return text(
        [
          `Proposal rejected (HTTP ${status}${body.error?.code ? `, ${body.error.code}` : ""}).`,
          body.error?.message ?? "",
          issues ? `\nFields that failed validation:\n${issues}` : "",
          status === 401
            ? `\nThe endpoint at ${baseUrl()} did not accept the token.`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
        true
      );
    }
  );

  server.registerTool(
    "propose_edge",
    {
      title: "Propose edge (not wired)",
      description:
        "STUB. Would open a PR updating data/<domain>/edges.yaml (or " +
        "cross_domain_edges.yaml). Currently returns the PR-pack flow instead.",
      inputSchema: {
        from: z.string().describe("Source claim id."),
        to: z.string().describe("Target claim id."),
        kind: edgeKind,
        strength: z.number().min(0).max(1),
        rationale: z.string(),
        sources: z.array(sourceSchema).default([]),
      },
    },
    async () => notWired()
  );

  server.registerTool(
    "propose_forecast_prediction",
    {
      title: "Propose forecast prediction (not wired)",
      description:
        "STUB. Would open a PR appending a prediction to " +
        "data/<domain>/forecasts/<id>.yaml. Currently returns the PR-pack " +
        "flow instead.",
      inputSchema: {
        forecastId: z.string().describe("Id of the forecast to append to."),
        probability: z.number().min(0).max(1),
        reasoning: z.string(),
      },
    },
    async () => notWired()
  );

  server.registerTool(
    "propose_dossier_position",
    {
      title: "Propose dossier position (not wired)",
      description:
        "STUB. Would open a PR creating or updating " +
        "data/<domain>/dossiers/<claim-id>.yaml. Currently returns the " +
        "PR-pack flow instead.",
      inputSchema: {
        claimId: z.string().describe("Id of the contested claim."),
        side: z.enum(["pro", "con"]),
        thesis: z.string(),
        steelmannedSummary: z.string(),
        keySources: z.array(sourceSchema),
      },
    },
    async () => notWired()
  );
}
