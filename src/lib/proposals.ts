import { z } from "zod";
import {
  Claim,
  ClaimKind,
  Dossier,
  Edge,
  EdgeKind,
  HttpUrl,
  Prediction,
  Source,
  type AgentAttribution,
} from "@/lib/types";
import { nextSequentialId } from "@/lib/ids";

/**
 * The agent write path: what a caller may send, and how it becomes graph data.
 *
 * Everything here is pure — no network, no filesystem, no clock — so the Worker
 * that fronts it stays a thin shell (HTTP, auth lookup, GitHub calls) and the
 * decisions that actually matter are unit-testable.
 *
 * The security posture, from research/integrity-anti-gaming.md: the caller is
 * not trusted. It supplies *content*; it does not supply identity, ids, or
 * timestamps. Those are stamped here from the token the request authenticated
 * with.
 */

/**
 * Upper bounds on everything a caller supplies.
 *
 * Not a security boundary on their own — the path is authenticated and rate
 * limited, and Cloudflare caps a body long before any of these bite. What they
 * buy is a *predictable* proposal: every one of these values is interpolated
 * into a PR body, and GitHub rejects a PR body over 65,536 characters with a
 * 422 that surfaces to the agent as an opaque `github_failed`. Sized so the
 * worst legal proposal renders well inside that: roughly 5k of rationale, 5k of
 * statement, and twelve sources at about 2.5k each.
 *
 * They are deliberately generous against real content — the largest claim in
 * `data/` today uses five sources and a 900-character statement — so a bound
 * firing means something odd, not something ordinary.
 */
export const LIMITS = {
  /** Ids and domain names. */
  id: 64,
  /** One-line fields: titles, theses, crux statements, source labels. */
  line: 500,
  /** Multi-paragraph fields: statements, summaries, rationales. */
  prose: 5_000,
  /** A quoted passage from a source. */
  excerpt: 2_000,
  url: 2_048,
  /** Any caller-supplied array: sources, keySources, dataAnchors, cruxes. */
  list: 12,
} as const;

/**
 * Largest proposal body the write path will buffer.
 *
 * Comfortably above the sum of `LIMITS` plus JSON overhead, so a legal proposal
 * never trips it. This is a guard against *reading* a large body, not a second
 * content limit to keep in sync with the bounds above.
 */
export const MAX_PROPOSAL_BYTES = 256 * 1024;

/** Thrown by `readCappedJson` when a body runs past `MAX_PROPOSAL_BYTES`. */
export class ProposalTooLarge extends Error {
  constructor() {
    super(`Proposal body exceeds ${MAX_PROPOSAL_BYTES} bytes.`);
    this.name = "ProposalTooLarge";
  }
}

/**
 * Parse a JSON body, counting bytes as they arrive and aborting past the cap.
 *
 * `request.json()` buffers the whole body first and asks questions afterwards,
 * so the `content-length` check in the Worker was the only thing between a
 * caller and an unbounded read. That header is self-reported and absent
 * entirely on a chunked request, which is the case the Worker's comment
 * conceded while claiming the schema covered it. It does not: Zod bounds what
 * gets committed, long after the bytes are already in memory.
 *
 * The stream is cancelled the moment the count crosses, so nothing past the cap
 * is retained. The path is authenticated and rate limited either way, which is
 * why this is worth exactly this much code and no more.
 */
export async function readCappedJson(request: Request): Promise<unknown> {
  const body = request.body;
  if (!body) throw new SyntaxError("Request has no body.");

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_PROPOSAL_BYTES) {
      await reader.cancel();
      throw new ProposalTooLarge();
    }
    chunks.push(value);
  }

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(buffer));
}

/**
 * `Source`, bounded for the write path.
 *
 * The bounds live here rather than on `Source` in `types.ts` on purpose. That
 * schema also validates what is already committed under `data/`, and tightening
 * it would retroactively invalidate content that is fine. What a stranger may
 * *send* and what the repo already *holds* are different questions.
 */
const BoundedSource = Source.extend({
  label: z.string().min(1).max(LIMITS.line),
  url: HttpUrl.max(LIMITS.url),
  authors: z.string().max(LIMITS.line).optional(),
  finding: z.string().max(LIMITS.line).optional(),
  excerpt: z.string().max(LIMITS.excerpt).optional(),
});

/** What an agent sends for `propose_claim`. Note what is absent: no `id`, no
 *  `authoredBy`, no `createdAt`. Those are the server's to mint. */
export const ClaimPayload = z.object({
  domain: z
    .string()
    .min(1)
    .max(LIMITS.id)
    .describe(
      "Domain the claim belongs to, e.g. 'inequality' or 'democratic_backsliding'. " +
        "Call list_claims to see the domains in use.",
    ),
  kind: ClaimKind.describe(
    "Where the claim sits in the problem tree: 'symptom' (an observed harm), " +
      "'mechanism' (what produces it), or 'leverage_point' (where intervention acts).",
  ),
  title: z.string().min(1).max(LIMITS.line).describe("Short noun phrase naming the claim, used as its label."),
  statement: z
    .string()
    .min(1)
    .max(LIMITS.prose)
    .describe("The falsifiable claim itself, stated so a distrustful reader could check it."),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Your credence that the statement is true, 0 to 1."),
  // At least one source. A claim with no citation is exactly the thing this
  // project exists not to publish, so it is rejected at the door rather than
  // left for a reviewer to catch.
  sources: z
    .array(BoundedSource)
    .min(1)
    .max(LIMITS.list)
    .describe(
      "At least one real source with a resolvable URL. A claim with no citation is rejected.",
    ),
});
export type ClaimPayload = z.infer<typeof ClaimPayload>;

/** What an agent sends for `propose_edge`. The edge `id` and its target file are
 *  the server's to determine; the caller names the two endpoints and the relation.
 *  The rationale is not here — it rides the envelope (like a claim's), and for an
 *  edge it is also stored as the edge's own `rationale`. */
export const EdgePayload = z.object({
  from: z.string().min(1).max(LIMITS.id).describe("Source claim id, the cause end of the relation."),
  to: z.string().min(1).max(LIMITS.id).describe("Target claim id, the effect end of the relation."),
  kind: EdgeKind.describe(
    "How the source acts on the target: 'causes', 'moderates' (changes the strength of " +
      "another relation), 'reduces', or 'evidences' (supports rather than produces).",
  ),
  strength: z
    .number()
    .min(0)
    .max(1)
    .describe("How strongly the source acts on the target, 0 to 1."),
  sources: z
    .array(BoundedSource)
    .max(LIMITS.list)
    .default([])
    .describe("Optional sources evidencing that the relation holds."),
});
export type EdgePayload = z.infer<typeof EdgePayload>;

/** What an agent sends for `propose_forecast_prediction`. The forecaster's
 *  `reasoning` rides the envelope (like an edge's rationale); the `agent` and
 *  `createdAt` are stamped server-side. */
export const PredictionPayload = z.object({
  forecastId: z.string().min(1).max(LIMITS.id).describe("Id of an existing forecast to append to."),
  probability: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "Your probability that the forecast's resolution criteria will be met, 0 to 1.",
    ),
  dataAnchors: z
    .array(BoundedSource)
    .max(LIMITS.list)
    .default([])
    .describe("Optional sources anchoring the estimate."),
});
export type PredictionPayload = z.infer<typeof PredictionPayload>;

/** One steel-manned side of a dossier. The `authoredBy` is stamped server-side. */
const ArgumentPayload = z.object({
  thesis: z.string().min(1).max(LIMITS.line).describe("One sentence stating what this side holds."),
  steelmannedSummary: z
    .string()
    .min(1)
    .max(LIMITS.prose)
    .describe(
      "The strongest honest version of this side's case, argued as its ablest proponent " +
        "would argue it rather than as its opponents characterise it.",
    ),
  keySources: z.array(BoundedSource).min(1).max(LIMITS.list).describe("At least one real source this side rests on."),
});

const CruxPayload = z.object({
  statement: z
    .string()
    .min(1)
    .max(LIMITS.line)
    .describe("A question whose answer would move a reasonable holder of one side toward the other."),
  impactScore: z
    .number()
    .min(0)
    .max(1)
    .describe("How much settling this crux would move the overall disagreement, 0 to 1."),
  uncertainty: z
    .number()
    .min(0)
    .max(1)
    .describe("How unsettled the crux currently is, 0 to 1."),
});

/** What an agent sends for `propose_dossier`: a COMPLETE dual-dossier for a claim
 *  that has none. A dossier requires both sides, so a one-sided proposal cannot
 *  form a valid one — the caller supplies both, and the server refuses to
 *  overwrite an existing dossier. */
export const DossierPayload = z.object({
  claimId: z
    .string()
    .min(1)
    .max(LIMITS.id)
    .describe("Id of the contested claim this dossier is for. Refused if it already has one."),
  pro: ArgumentPayload.describe("The steel-manned case that the claim holds."),
  con: ArgumentPayload.describe("The steel-manned case against it. Required; a dossier is two-sided."),
  cruxes: z
    .array(CruxPayload)
    .max(LIMITS.list)
    .default([])
    .describe("Optional ranked questions that would move the disagreement if settled."),
});
export type DossierPayload = z.infer<typeof DossierPayload>;

export const PROPOSAL_KINDS = [
  "claim",
  "edge",
  "prediction",
  "dossier",
] as const;

export const ProposalEnvelope = z.object({
  kind: z.enum(PROPOSAL_KINDS),
  payload: z.unknown(),
  rationale: z
    .string()
    .min(1, "A rationale is required: it becomes the PR body.")
    .max(LIMITS.prose),
});
export type ProposalEnvelope = z.infer<typeof ProposalEnvelope>;

/** Identity resolved from the bearer token. Never from the request body. */
export type TokenIdentity = {
  /** Short, stable handle for the credential. Used in the branch name. */
  tokenId: string;
  /** The accountable human or org behind the credential. */
  operator: string;
  /** Free-form model label, e.g. "claude-opus-4-8". */
  agent: string;
  /** Stable id for the agent configuration. */
  agentId: string;
};

// --- claim ids -------------------------------------------------------------

const KIND_LETTER: Record<z.infer<typeof ClaimKind>, string> = {
  symptom: "S",
  mechanism: "M",
  leverage_point: "L",
};

/**
 * Infer a domain's id prefix from the claims it already contains.
 *
 * The convention (CLAUDE.md) is `<domainPrefix><kindLetter><n>`:
 * `S1`/`M1`/`L1` in democratic_backsliding (empty prefix), `IS1`/`IM1`/`IL1` in
 * inequality, `ECS1`/`ECM1`/`ECL1` in epistack_cases. The prefix is not derivable
 * from the domain's *name* (`EC` for epistack_cases is initials; `I` for
 * inequality is not), so it is read off the existing ids instead. That keeps the
 * rule in one place — the data — rather than in a registry that drifts.
 *
 * Returns null when the domain has no claims yet, or when its existing ids do
 * not agree on a prefix. Both are refusals, not guesses: minting an id under a
 * wrong prefix would silently fork a domain's namespace.
 */
export function inferDomainPrefix(existingIdsInDomain: readonly string[]): string | null {
  const letters = Object.values(KIND_LETTER);
  const prefixes = new Set<string>();

  for (const id of existingIdsInDomain) {
    const withoutSeq = id.replace(/\d+$/, "");
    if (withoutSeq === id) return null; // no trailing number: not our convention
    const letter = withoutSeq.slice(-1);
    if (!letters.includes(letter)) return null;
    prefixes.add(withoutSeq.slice(0, -1));
  }

  if (prefixes.size !== 1) return null; // no claims, or a domain with mixed prefixes
  return [...prefixes][0];
}

/** Next free id for a claim of this kind in this domain. */
export function mintClaimId(
  prefix: string,
  kind: z.infer<typeof ClaimKind>,
  allExistingIds: readonly string[],
): string {
  return nextSequentialId(`${prefix}${KIND_LETTER[kind]}`, allExistingIds);
}

// --- assembly --------------------------------------------------------------

/**
 * Which door a proposal came through. Stamped into `promptTitle` so a reader of
 * the corpus can tell an HTTP filing from an MCP tool call; both routes share
 * this pipeline, so nothing else in the record distinguishes them.
 *
 * Set by the transport shell, never read from the envelope: it is provenance,
 * and provenance a caller can assert is worthless. Same rule as `operator`.
 */
export type ProposalEntryPoint = string;

/** The default door, for a caller that does not name one. */
export const HTTP_ENTRY_POINT: ProposalEntryPoint = "POST /api/proposals";

function attributionPromptTitle(via: ProposalEntryPoint | undefined): string {
  return `Agent proposal via ${via ?? HTTP_ENTRY_POINT}`;
}

export type BuildClaimInput = {
  /** Which door this came through; see ProposalEntryPoint. */
  via?: ProposalEntryPoint;
  payload: ClaimPayload;
  identity: TokenIdentity;
  /** Ids of claims already in the target domain. Used to infer its id prefix. */
  existingIdsInDomain: readonly string[];
  /** Every claim id in the graph. Used to mint an id that collides with nothing. */
  allExistingIds: readonly string[];
  /** ISO-8601. Injected rather than read from a clock, so this stays pure. */
  now: string;
};

export type BuildClaimResult =
  | { ok: true; claim: Claim }
  | { ok: false; error: string };

/**
 * Turn a validated payload into a full Claim, stamping everything the caller is
 * not trusted to assert: the id, the timestamp, and the attribution.
 */
export function buildClaim({
  payload,
  identity,
  existingIdsInDomain,
  allExistingIds,
  now,
  via,
}: BuildClaimInput): BuildClaimResult {
  const prefix = inferDomainPrefix(existingIdsInDomain);
  if (prefix === null) {
    return {
      ok: false,
      error:
        `Cannot mint an id for domain "${payload.domain}": it has no existing claims, ` +
        `or its ids do not agree on a prefix. A new domain's id prefix is seeded by a ` +
        `human (see CLAUDE.md); the write path will not invent one.`,
    };
  }

  const authoredBy: AgentAttribution = {
    agent: identity.agent,
    promptTitle: attributionPromptTitle(via),
    operator: identity.operator,
    agentId: identity.agentId,
    generatedAt: now,
  };

  const parsed = Claim.safeParse({
    id: mintClaimId(prefix, payload.kind, allExistingIds),
    kind: payload.kind,
    title: payload.title,
    statement: payload.statement,
    domain: payload.domain,
    confidence: payload.confidence,
    sources: payload.sources,
    dataPoints: [],
    analyses: [],
    authoredBy,
    createdAt: now,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; "),
    };
  }
  return { ok: true, claim: parsed.data };
}

export type BuildEdgeInput = {
  payload: EdgePayload;
  /** The relation's rationale, from the proposal envelope. Required there, so an
   *  edge always gets one — stored on the edge and used as the PR body. */
  rationale: string;
  /** claimId → its domain, for every claim in the graph. Endpoints are checked
   *  against this, and it decides intra- vs cross-domain. */
  claimDomains: ReadonlyMap<string, string>;
  /** domain → its claim ids, to infer the domain's id prefix for an intra edge. */
  claimIdsByDomain: ReadonlyMap<string, readonly string[]>;
  /** every edge id in the graph, so the minted id collides with nothing. */
  allEdgeIds: readonly string[];
};

export type BuildEdgeResult =
  | { ok: true; edge: Edge; path: string; crossDomain: boolean }
  | { ok: false; error: string };

/**
 * Turn a validated edge payload into a full Edge, and decide which file it
 * belongs in. An edge within one domain lands in that domain's `edges.yaml`
 * with an id on the domain's own prefix (`E`, `IE`, `ECE`); an edge spanning two
 * domains lands in `cross_domain_edges.yaml` with a `CE` id.
 *
 * Edges carry no attribution in the schema — their provenance is the PR that
 * files them — so unlike buildClaim this stamps only the id.
 */
export function buildEdge({
  payload,
  rationale,
  claimDomains,
  claimIdsByDomain,
  allEdgeIds,
}: BuildEdgeInput): BuildEdgeResult {
  const { from, to } = payload;

  if (from === to) {
    return { ok: false, error: `An edge cannot point a claim at itself ("${from}").` };
  }
  const fromDomain = claimDomains.get(from);
  const toDomain = claimDomains.get(to);
  if (!fromDomain) return { ok: false, error: `Unknown source claim "${from}".` };
  if (!toDomain) return { ok: false, error: `Unknown target claim "${to}".` };

  const crossDomain = fromDomain !== toDomain;
  let stem: string;
  let path: string;

  if (crossDomain) {
    stem = "CE";
    path = "data/cross_domain_edges.yaml";
  } else {
    const prefix = inferDomainPrefix(claimIdsByDomain.get(fromDomain) ?? []);
    if (prefix === null) {
      return {
        ok: false,
        error: `Cannot infer the id prefix for domain "${fromDomain}" — it has no existing claims.`,
      };
    }
    stem = `${prefix}E`;
    path = `data/${fromDomain}/edges.yaml`;
  }

  const parsed = Edge.safeParse({
    id: nextSequentialId(stem, allEdgeIds),
    fromId: from,
    toId: to,
    kind: payload.kind,
    strength: payload.strength,
    rationale,
    sources: payload.sources,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; "),
    };
  }
  return { ok: true, edge: parsed.data, path, crossDomain };
}

export type BuildPredictionInput = {
  /** Which door this came through; see ProposalEntryPoint. */
  via?: ProposalEntryPoint;
  payload: PredictionPayload;
  /** The forecaster's reasoning, from the proposal envelope. */
  reasoning: string;
  identity: TokenIdentity;
  /** Every forecast id in the graph, to reject an append to one that doesn't exist. */
  knownForecastIds: ReadonlySet<string>;
  /** ISO-8601, injected rather than read from a clock. */
  now: string;
};

export type BuildPredictionResult =
  | { ok: true; prediction: Prediction; forecastId: string }
  | { ok: false; error: string };

/**
 * Turn a validated prediction payload into a full Prediction, stamping the
 * authoring agent and the timestamp. The forecast it attaches to must exist —
 * predictions only ever append to a forecast a human already opened.
 */
export function buildPrediction({
  payload,
  reasoning,
  identity,
  knownForecastIds,
  now,
  via,
}: BuildPredictionInput): BuildPredictionResult {
  if (!knownForecastIds.has(payload.forecastId)) {
    return { ok: false, error: `Unknown forecast "${payload.forecastId}".` };
  }

  const agent: AgentAttribution = {
    agent: identity.agent,
    promptTitle: attributionPromptTitle(via),
    operator: identity.operator,
    agentId: identity.agentId,
    generatedAt: now,
  };

  const parsed = Prediction.safeParse({
    agent,
    probability: payload.probability,
    reasoning,
    baseRates: [],
    dataAnchors: payload.dataAnchors,
    createdAt: now,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; "),
    };
  }
  return { ok: true, prediction: parsed.data, forecastId: payload.forecastId };
}

export type BuildDossierInput = {
  /** Which door this came through; see ProposalEntryPoint. */
  via?: ProposalEntryPoint;
  payload: DossierPayload;
  identity: TokenIdentity;
  /** Whether the target claim exists in the graph. */
  claimExists: boolean;
  /** Whether the target claim already has a dossier (refuse — don't overwrite). */
  dossierExists: boolean;
  now: string;
};

export type BuildDossierResult =
  | { ok: true; dossier: Dossier }
  | { ok: false; error: string };

/**
 * Turn a validated payload into a complete Dossier, stamping the authoring agent
 * on both sides. A dossier is a whole two-sided artifact — this only ever creates
 * one where none exists; it refuses to overwrite a curated dossier, and refuses a
 * claim that does not exist.
 */
export function buildDossier({
  payload,
  identity,
  claimExists,
  dossierExists,
  now,
  via,
}: BuildDossierInput): BuildDossierResult {
  if (!claimExists) {
    return { ok: false, error: `Unknown claim "${payload.claimId}".` };
  }
  if (dossierExists) {
    return {
      ok: false,
      error:
        `Claim "${payload.claimId}" already has a dossier. The write path creates a ` +
        `dossier where none exists; it will not overwrite a curated one.`,
    };
  }

  const authoredBy: AgentAttribution = {
    agent: identity.agent,
    promptTitle: attributionPromptTitle(via),
    operator: identity.operator,
    agentId: identity.agentId,
    generatedAt: now,
  };
  const side = (a: DossierPayload["pro"]) => ({
    thesis: a.thesis,
    steelmannedSummary: a.steelmannedSummary,
    keySources: a.keySources,
    authoredBy,
  });

  const parsed = Dossier.safeParse({
    attachedToClaimId: payload.claimId,
    pro: side(payload.pro),
    con: side(payload.con),
    cruxes: payload.cruxes,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; "),
    };
  }
  return { ok: true, dossier: parsed.data };
}
