/**
 * The tool catalogue the MCP endpoint advertises, and the only place a tool's
 * name, description and input schema are written down.
 *
 * The input schemas are *derived* from the canonical Zod payload schemas in
 * `src/lib/proposals.ts` rather than hand-written as JSON Schema. That matters:
 * a hand-copied schema is a second definition of what a valid proposal is, and
 * the moment it drifts an agent is told one thing and validated against
 * another. `z.toJSONSchema(..., { io: "input" })` renders exactly what the
 * validator accepts, including which fields are optional because they carry a
 * default.
 *
 * Read tools have no canonical schema to derive from — they are projections of
 * the published API, not writes — so their argument shapes are declared here in
 * Zod and rendered through the same path.
 */
import { z } from "zod";
import {
  ClaimPayload,
  DossierPayload,
  EdgePayload,
  PredictionPayload,
  type PROPOSAL_KINDS,
} from "@/lib/proposals";

/** A JSON Schema document, as handed to an MCP client. */
export type JsonSchema = Record<string, unknown>;

/**
 * What the endpoint does when a tool is called. The pure layer decides *which*
 * tool a call names and whether the caller may run it; the Worker performs the
 * IO this describes.
 */
export type ToolHandler =
  /** Reads a projection of the published JSON-LD. Public: no token required. */
  | { kind: "read"; op: ReadOp }
  /**
   * Files a proposal through the same path as `POST /api/proposals`. The named
   * field carries the caller's prose into the envelope's `rationale`; whatever
   * remains is the payload.
   */
  | {
      kind: "write";
      proposalKind: (typeof PROPOSAL_KINDS)[number];
      rationaleField: "rationale" | "reasoning";
    };

export type ReadOp =
  | "list_claims"
  | "get_claim"
  | "get_graph"
  | "get_forecast"
  | "get_dossier";

/**
 * The behavioural hints `tools/list` publishes alongside a tool.
 *
 * The spec is explicit that a client **MUST** treat these as untrusted unless
 * the server is trusted, so they are a display and reasoning aid, never an
 * access-control decision. That cuts both ways: they buy a caller nothing if
 * they are wrong, so the only version worth publishing is the honest one.
 *
 * `destructiveHint` and `idempotentHint` are meaningful only when
 * `readOnlyHint` is false, so they are omitted on the read tools rather than
 * set to a value that reads as a claim about a question that does not arise.
 */
export type ToolAnnotations = {
  readOnlyHint: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint: boolean;
};

/**
 * Annotations are *derived* from the handler, not written per tool.
 *
 * The handler already encodes the only thing the hints depend on: whether a
 * tool reads a projection of the published graph or files a proposal. Writing
 * them out per tool would be a second statement of that same fact, free to
 * drift the moment a tool changes kind, which is the duplication the input
 * schemas are derived to avoid.
 */
function annotationsFor(handler: ToolHandler): ToolAnnotations {
  if (handler.kind === "read") {
    // Reads a projection of our own published API: a closed, known domain, so
    // not "open world" in the sense the spec means (a web search or a fetch of
    // an arbitrary URL).
    return { readOnlyHint: true, openWorldHint: false };
  }
  return {
    readOnlyHint: false,
    // Opens a pull request. It adds, never edits or deletes, and the PR is
    // never auto-merged, so nothing a caller does here can destroy existing
    // graph data. This is the substantive claim in the whole set.
    destructiveHint: false,
    // Two identical calls open two pull requests. Nothing dedupes them.
    idempotentHint: false,
    // The proposal lands on GitHub, which is an external system.
    openWorldHint: true,
  };
}

export type ToolDescriptor = {
  name: string;
  title: string;
  description: string;
  /** Rendered from `args`; what `tools/list` publishes. */
  inputSchema: JsonSchema;
  /** Derived from `handler`; what `tools/list` publishes. */
  annotations: ToolAnnotations;
  /** The same shape as `inputSchema`, still executable. Validates read args. */
  args: z.ZodType;
  handler: ToolHandler;
};

/** Render a Zod object as the JSON Schema an MCP client will validate against.
 *  draft-07 rather than 2020-12: it is explicitly permitted by the spec and it
 *  is what the widest set of client-side validators actually implement. */
function schemaOf(shape: z.ZodType): JsonSchema {
  return z.toJSONSchema(shape, { target: "draft-7", io: "input" });
}

function tool(
  name: string,
  title: string,
  description: string,
  args: z.ZodType,
  handler: ToolHandler,
): ToolDescriptor {
  return {
    name,
    title,
    description,
    inputSchema: schemaOf(args),
    annotations: annotationsFor(handler),
    args,
    handler,
  };
}

// --- read tools ------------------------------------------------------------

const listClaimsArgs = z.object({
  domain: z
    .string()
    .optional()
    .describe("Restrict results to this domain. Omit for all domains."),
});

const claimIdArgs = z.object({
  id: z.string().min(1).describe("Claim id, e.g. 'M4' or 'IS1'."),
});

const forecastArgs = z.object({
  id: z.string().min(1).describe("A claim id (e.g. 'M4') or a forecast id (e.g. 'F4')."),
});

const dossierArgs = z.object({
  claim_id: z.string().min(1).describe("Id of the claim the dossier is attached to."),
});

// --- write tools -----------------------------------------------------------
//
// Each is its canonical payload schema plus the prose that becomes the PR body.
// The payload half is not restated here, so it cannot drift from the validator.

const proposeClaimArgs = ClaimPayload.extend({
  rationale: z
    .string()
    .min(1)
    .describe("Why this claim belongs in the graph. Becomes the PR body."),
});

const proposeEdgeArgs = EdgePayload.extend({
  rationale: z
    .string()
    .min(1)
    .describe("What makes this relation hold. Required; becomes the PR body and the edge's own rationale."),
});

const proposePredictionArgs = PredictionPayload.extend({
  reasoning: z
    .string()
    .min(1)
    .describe("Why this probability. Required; stored as the prediction's reasoning."),
});

const proposeDossierArgs = DossierPayload.extend({
  rationale: z.string().min(1).describe("Why this dossier belongs. Becomes the PR body."),
});

/**
 * The nine tools, in a stable order — the spec asks for deterministic ordering
 * so clients can cache the list.
 */
/**
 * Closing sentence on every write tool's description.
 *
 * The gateway hint rides here rather than in SERVER_INSTRUCTIONS because a
 * gateway that aggregates several servers answers `initialize` with its own
 * serverInfo and drops ours, while tool descriptions are passed through
 * verbatim. This is the only text that reaches the caller who needs it.
 */
const WRITE_AUTH_NOTE =
  "Requires an Authorization: Bearer token. If your client settles authentication when " +
  "it connects rather than per call, point it at /mcp?auth=required, which raises the " +
  "challenge at the handshake instead of here.";

export const TOOLS: readonly ToolDescriptor[] = [
  tool(
    "list_claims",
    "List claims",
    "List every claim as a compact summary (id, kind, title, domain, confidence). " +
      "Optionally filter by domain (e.g. 'inequality', 'democratic_backsliding').",
    listClaimsArgs,
    { kind: "read", op: "list_claims" },
  ),
  tool(
    "get_claim",
    "Get claim",
    "Fetch one claim by id (e.g. 'M4', 'IS1') with its full JSON-LD: sources, " +
      "observations, author attribution, incoming/outgoing edges, attached forecasts, " +
      "and dossier if present.",
    claimIdArgs,
    { kind: "read", op: "get_claim" },
  ),
  tool(
    "get_graph",
    "Get graph",
    "Fetch the full claim graph as JSON-LD: every claim, edge, forecast, and dossier " +
      "across all domains. Verbatim API response.",
    z.object({}),
    { kind: "read", op: "get_graph" },
  ),
  tool(
    "get_forecast",
    "Get forecast",
    "Fetch forecast(s). Pass a claim id (e.g. 'M4') to get all forecasts attached to " +
      "that claim, or a forecast id (e.g. 'F4') to get that one forecast. The aboard " +
      "API has no dedicated forecast endpoint, so a forecast id is resolved by scanning " +
      "the full graph.",
    forecastArgs,
    { kind: "read", op: "get_forecast" },
  ),
  tool(
    "get_dossier",
    "Get dossier",
    "Fetch the dual-dossier debate (pro/con arguments and ranked cruxes) attached to a " +
      "claim. Pass the contested claim's id (e.g. 'M4'). Dossiers are embedded in the " +
      "claim response under aboard:dossier.",
    dossierArgs,
    { kind: "read", op: "get_dossier" },
  ),
  tool(
    "propose_claim",
    "Propose a claim",
    "Opens a pull request adding one claim to data/<domain>/claims/. The claim id, " +
      "timestamp, and authorship are stamped server-side from your agent token — do not " +
      "send them. At least one real source is required. The PR is NEVER auto-merged: a " +
      "human reviews it and CI must pass. " + WRITE_AUTH_NOTE,
    proposeClaimArgs,
    { kind: "write", proposalKind: "claim", rationaleField: "rationale" },
  ),
  tool(
    "propose_edge",
    "Propose an edge",
    "Opens a pull request adding one directed edge between two existing claims. The edge " +
      "id and its target file (a domain's edges.yaml, or cross_domain_edges.yaml when the " +
      "endpoints span domains) are determined server-side — do not send an id. The PR is " +
      "NEVER auto-merged: a human reviews it and CI must pass. " + WRITE_AUTH_NOTE,
    proposeEdgeArgs,
    { kind: "write", proposalKind: "edge", rationaleField: "rationale" },
  ),
  tool(
    "propose_forecast_prediction",
    "Propose a forecast prediction",
    "Opens a pull request appending one prediction to an existing forecast's predictions " +
      "list. The authoring agent and timestamp are stamped server-side. The PR is NEVER " +
      "auto-merged: a human reviews it and CI must pass. " + WRITE_AUTH_NOTE,
    proposePredictionArgs,
    { kind: "write", proposalKind: "prediction", rationaleField: "reasoning" },
  ),
  tool(
    "propose_dossier",
    "Propose a dual-dossier",
    "Opens a pull request creating a COMPLETE two-sided dossier — a steel-manned pro case " +
      "and con case, plus optional ranked cruxes — for a contested claim that has none. " +
      "Both sides are required; a dossier is inherently two-sided. Refuses if the claim " +
      "already has a dossier (it will not overwrite a curated one). The authoring agent is " +
      "stamped server-side. NEVER auto-merged. " + WRITE_AUTH_NOTE,
    proposeDossierArgs,
    { kind: "write", proposalKind: "dossier", rationaleField: "rationale" },
  ),
];

export function findTool(name: string): ToolDescriptor | undefined {
  return TOOLS.find((t) => t.name === name);
}

/** What `tools/list` publishes: the catalogue without the executable schema. */
export function toolListing(): {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  annotations: ToolAnnotations;
}[] {
  return TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({
    name,
    title,
    description,
    inputSchema,
    annotations,
  }));
}
