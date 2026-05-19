/**
 * Write tools. Declared so the surface is discoverable and matches
 * `research/agent-onboarding.md` + `CONTRIBUTING.md`, but NOT wired: the
 * gated PR-opening path (service token, GitHub App, Zod-validated payload)
 * is not built yet. Each tool returns a clear message pointing contributors
 * at the existing PR-pack flow documented in `CONTRIBUTING.md`.
 *
 * Input schemas mirror the aboard Zod types (`src/lib/types.ts`) so an agent
 * can see the eventual payload shape even though the call is a no-op today.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

type TextResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

const NOT_WIRED =
  "Not yet wired. The gated write-back path (service token + GitHub App + " +
  "Zod-validated PR) described in research/agent-onboarding.md is not built. " +
  "To file content today, use the PR-pack flow in CONTRIBUTING.md: sketch in " +
  "the /graph sandbox, export the PR pack, clone the repo and unpack into " +
  "data/<domain>/, fill in real Source citations and DataPoint anchors, " +
  "validate with `npx tsx clients/validate.ts` + `npm run build`, then open " +
  "a pull request. See CONTRIBUTING.md (\"Humans\" section) for the full steps.";

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
      title: "Propose claim (not wired)",
      description:
        "STUB. Would open a PR adding one claim Markdown file under " +
        "data/<domain>/claims/. Currently returns the PR-pack flow instead.",
      inputSchema: {
        domain: z.string().describe("Target domain for the new claim."),
        kind: claimKind,
        title: z.string(),
        statement: z.string(),
        confidence: z.number().min(0).max(1),
        sources: z.array(sourceSchema),
        rationale: z
          .string()
          .describe("Why this claim belongs in the graph (for the PR body)."),
      },
    },
    async () => notWired()
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
