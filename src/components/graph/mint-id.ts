/**
 * Minting a claim id for the sandbox editor.
 *
 * Claim ids are globally unique across domains (CLAUDE.md), which the corpus
 * achieves by giving each domain its own prefix: `democratic_backsliding` uses
 * bare `S1`/`M1`/`L1`, `inequality` uses `IS1`/`IM1`/`IL1`, `epistack_cases`
 * uses `ECS1`/`ECM1`/`ECL1`. The editor used to mint bare `S`/`M`/`L` whatever
 * the target domain, so a claim filed into `inequality` came out as `S4`, an id
 * that collides with `democratic_backsliding` the moment the exported PR pack
 * is applied, and that carries the wrong namespace in the "Copy JSON-LD"
 * `@id`s meanwhile.
 */

const KIND_LETTER: Record<EngineNode["kind"], "S" | "M" | "L"> = {
  symptom: "S",
  mechanism: "M",
  leverage: "L",
};

/** `<domain prefix><kind letter><n>`: "IS1", "S12", "ECM2". */
const ID_SHAPE = /^([A-Z]*)([SML])([0-9]+)$/;

/** The two fields minting reads off a claim. */
export type MintableClaim = { id: string; domain?: string };

/**
 * The initials of a domain name: `inequality` to "I", `epistack_cases` to "EC".
 * Only reached for a domain with no claims yet, so it decides a convention
 * exactly once and the data carries it from then on.
 */
function initials(domain: string): string {
  return domain
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase())
    .join("");
}

/**
 * The prefix a domain's claims already use, read off the corpus rather than
 * guessed, so a mint follows whatever convention that domain settled on. That
 * is what makes `democratic_backsliding` come out right: its prefix is the
 * empty string, which no rule derived from the domain's name would produce.
 *
 * A stray id in the wrong shape does not get a vote, and if a domain somehow
 * holds two conventions the more common one wins.
 */
export function domainPrefix(
  domain: string | undefined,
  claims: MintableClaim[]
): string {
  if (!domain) return "";
  const counts = new Map<string, number>();
  for (const claim of claims) {
    if (claim.domain !== domain) continue;
    const match = ID_SHAPE.exec(claim.id);
    if (!match) continue;
    counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [prefix, count] of counts) {
    if (count > bestCount) {
      best = prefix;
      bestCount = count;
    }
  }
  return best ?? initials(domain);
}

/**
 * The next free id for a claim of `kind` in `domain`.
 *
 * Uniqueness is checked against every claim in the graph, not just the
 * domain's own. The prefix is what makes the namespaces disjoint, and a mint
 * that assumed disjointness instead of checking it would be the same bug one
 * level up.
 */
export function mintClaimId(
  kind: EngineNode["kind"],
  domain: string | undefined,
  claims: MintableClaim[]
): string {
  const stem = domainPrefix(domain, claims) + KIND_LETTER[kind];
  const taken = new Set(claims.map((claim) => claim.id));
  let n = 1;
  while (taken.has(stem + n)) n++;
  return stem + n;
}
