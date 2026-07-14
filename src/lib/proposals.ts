import { z } from "zod";
import { Claim, ClaimKind, Source, type AgentAttribution } from "@/lib/types";

/**
 * The agent write path: what a caller may send, and how it becomes a Claim.
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

/** What an agent sends for `propose_claim`. Note what is absent: no `id`, no
 *  `authoredBy`, no `createdAt`. Those are the server's to mint. */
export const ClaimPayload = z.object({
  domain: z.string().min(1),
  kind: ClaimKind,
  title: z.string().min(1),
  statement: z.string().min(1),
  confidence: z.number().min(0).max(1),
  // At least one source. A claim with no citation is exactly the thing this
  // project exists not to publish, so it is rejected at the door rather than
  // left for a reviewer to catch.
  sources: z.array(Source).min(1),
});
export type ClaimPayload = z.infer<typeof ClaimPayload>;

export const PROPOSAL_KINDS = [
  "claim",
  "edge",
  "prediction",
  "dossier_position",
] as const;

export const ProposalEnvelope = z.object({
  kind: z.enum(PROPOSAL_KINDS),
  payload: z.unknown(),
  rationale: z.string().min(1, "A rationale is required: it becomes the PR body."),
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

/**
 * Next free id for a claim of this kind in this domain.
 *
 * Takes the max sequence number already used for the prefix+kind and adds one,
 * rather than counting: ids are never reused, so a deleted `S3` does not come
 * back and collide with the `S3` some consumer already cached.
 */
export function mintClaimId(
  prefix: string,
  kind: z.infer<typeof ClaimKind>,
  allExistingIds: readonly string[],
): string {
  const stem = `${prefix}${KIND_LETTER[kind]}`;
  const pattern = new RegExp(`^${stem}(\\d+)$`);

  let max = 0;
  for (const id of allExistingIds) {
    const m = pattern.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${stem}${max + 1}`;
}

// --- assembly --------------------------------------------------------------

export type BuildClaimInput = {
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
    promptTitle: "Agent proposal via /api/proposals",
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
