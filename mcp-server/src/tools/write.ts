/**
 * Write tools. All four are wired: `propose_claim`, `propose_edge`,
 * `propose_forecast_prediction`, and `propose_dossier` each POST to the deployed
 * `/api/proposals` endpoint, which validates against the canonical Zod schemas,
 * stamps provenance from the agent token, and opens a pull request. None ever
 * merges — a human is the admission gate, and CI must pass.
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

// --- shared schema fragments (mirror src/lib/types.ts) ---

/**
 * http(s) only, mirroring `HttpUrl` in `src/lib/types.ts`. Spelled with
 * `.refine` rather than Zod 4's `z.url({ protocol })` because this package is
 * on Zod 3 (`package.json` pins `^3.23.8`), where that option does not exist.
 * The duplication is the same one this whole file carries: mirroring the app's
 * schemas across a major-version boundary. The server rejects at the door so a
 * caller learns of a bad scheme here rather than from the Worker.
 */
const httpUrl = z
  .string()
  .url()
  .refine(
    (value) => {
      try {
        return /^https?:$/.test(new URL(value).protocol);
      } catch {
        return false;
      }
    },
    { message: "Source URL must be http(s)." },
  );

const sourceSchema = z.object({
  label: z.string(),
  url: httpUrl,
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

/**
 * POST a proposal and render the endpoint's reply for a human/agent reader.
 * Shared by every write tool: the success and the structured-rejection paths
 * are identical across proposal kinds, so they live in one place.
 */
async function fileProposal(
  kind: "claim" | "edge" | "prediction" | "dossier",
  payload: unknown,
  rationale: string
): Promise<TextResult> {
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
    result = await postProposal({ kind, payload, rationale }, token);
  } catch (err) {
    return text(err instanceof ApiError ? err.message : String(err), true);
  }

  const { status, body } = result;

  if (status === 201 && body.pullRequest) {
    return text(
      [
        `Proposed ${body.id} — pull request opened.`,
        ``,
        `  ${body.pullRequest}`,
        ``,
        `File: ${body.path}`,
        `It is NOT merged. A human reviews it, and CI (build, referential integrity, tests) must pass.`,
      ].join("\n")
    );
  }

  // The rejection path is the useful one: hand back the exact field paths so the
  // caller can fix its payload rather than guess.
  const issues = body.error?.issues
    ?.map((i) => `  - ${i.path || "(root)"}: ${i.message}`)
    .join("\n");

  return text(
    [
      `Proposal rejected (HTTP ${status}${body.error?.code ? `, ${body.error.code}` : ""}).`,
      body.error?.message ?? "",
      issues ? `\nFields that failed validation:\n${issues}` : "",
      status === 401 ? `\nThe endpoint at ${baseUrl()} did not accept the token.` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    true
  );
}

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
    async ({ rationale, ...payload }): Promise<TextResult> =>
      fileProposal("claim", payload, rationale)
  );

  server.registerTool(
    "propose_edge",
    {
      title: "Propose an edge",
      description:
        "Opens a pull request adding one directed edge between two existing claims. " +
        "The edge id and its target file (a domain's edges.yaml, or cross_domain_edges.yaml " +
        "when the endpoints span domains) are determined server-side — do not send an id. " +
        "The PR is NEVER auto-merged: a human reviews it and CI must pass. Requires ABOARD_AGENT_TOKEN.",
      inputSchema: {
        from: z.string().describe("Source claim id (must already exist)."),
        to: z.string().describe("Target claim id (must already exist)."),
        kind: edgeKind,
        strength: z.number().min(0).max(1),
        rationale: z
          .string()
          .describe("What makes this relation hold. Required; becomes the PR body."),
        sources: z
          .array(sourceSchema)
          .default([])
          .describe("Optional evidence for the relation. URLs must resolve to real pages."),
      },
    },
    async ({ rationale, ...payload }): Promise<TextResult> =>
      fileProposal("edge", payload, rationale)
  );

  server.registerTool(
    "propose_forecast_prediction",
    {
      title: "Propose a forecast prediction",
      description:
        "Opens a pull request appending one prediction to an existing forecast's " +
        "predictions list. The authoring agent and timestamp are stamped server-side. " +
        "The PR is NEVER auto-merged: a human reviews it and CI must pass. Requires ABOARD_AGENT_TOKEN.",
      inputSchema: {
        forecastId: z.string().describe("Id of an existing forecast (e.g. F4, IF1)."),
        probability: z.number().min(0).max(1),
        reasoning: z
          .string()
          .describe("Why this probability. Required; stored as the prediction's reasoning."),
        dataAnchors: z
          .array(sourceSchema)
          .default([])
          .describe("Optional sources anchoring the estimate."),
      },
    },
    async ({ reasoning, ...payload }): Promise<TextResult> =>
      fileProposal("prediction", payload, reasoning)
  );

  const argumentInput = z.object({
    thesis: z.string(),
    steelmannedSummary: z.string(),
    keySources: z.array(sourceSchema).min(1),
  });
  const cruxInput = z.object({
    statement: z.string(),
    impactScore: z.number().min(0).max(1),
    uncertainty: z.number().min(0).max(1),
  });

  server.registerTool(
    "propose_dossier",
    {
      title: "Propose a dual-dossier",
      description:
        "Opens a pull request creating a COMPLETE two-sided dossier — a steel-manned " +
        "pro case and con case, plus optional ranked cruxes — for a contested claim that " +
        "has none. Both sides are required; a dossier is inherently two-sided. Refuses if " +
        "the claim already has a dossier (it will not overwrite a curated one). The authoring " +
        "agent is stamped server-side. NEVER auto-merged. Requires ABOARD_AGENT_TOKEN.",
      inputSchema: {
        claimId: z.string().describe("The contested claim (must exist and lack a dossier)."),
        pro: argumentInput.describe("The steel-manned case FOR the claim."),
        con: argumentInput.describe("The steel-manned case AGAINST it."),
        cruxes: z
          .array(cruxInput)
          .default([])
          .describe("Ranked cruxes: questions whose resolution would move the disagreement."),
        rationale: z.string().describe("Why this dossier belongs. Becomes the PR body."),
      },
    },
    async ({ rationale, ...payload }): Promise<TextResult> =>
      fileProposal("dossier", payload, rationale)
  );
}
