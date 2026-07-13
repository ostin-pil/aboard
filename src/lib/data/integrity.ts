import type { ClaimGraph } from "@/lib/types";

/**
 * Referential integrity for the loaded graph.
 *
 * The Zod schemas validate each file in isolation: they cannot see that an
 * edge points at a claim that does not exist, or that two domains minted the
 * same claim ID. Those are cross-file invariants, so they are checked here,
 * once, after every file has parsed.
 *
 * Every violation is collected before throwing, so a contributor fixing bad
 * data sees the whole list at once rather than peeling it off one file per
 * run. The message carries the offending file, matching how the Zod parse
 * errors already read.
 */

export type EntityKind =
  | "claim"
  | "edge"
  | "forecast"
  | "dossier"
  | "analysis";

/**
 * Where a loaded entity came from. The loader records one of these per file it
 * parses, including duplicates — duplicate detection is one of the checks, so
 * this list must not be deduplicated on the way in.
 */
export type SourceRef = {
  kind: EntityKind;
  id: string;
  file: string;
};

/** Dossiers carry no `id` of their own; they are keyed by the claim they attach to. */
const dossierKey = (attachedToClaimId: string) => attachedToClaimId;

function fileIndex(refs: readonly SourceRef[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const ref of refs) {
    const key = `${ref.kind}:${ref.id}`;
    if (!index.has(key)) index.set(key, ref.file);
  }
  return index;
}

function duplicateErrors(refs: readonly SourceRef[]): string[] {
  const seen = new Map<string, string[]>();
  for (const ref of refs) {
    const key = `${ref.kind}:${ref.id}`;
    const files = seen.get(key);
    if (files) files.push(ref.file);
    else seen.set(key, [ref.file]);
  }

  const errors: string[] = [];
  for (const [key, files] of seen) {
    if (files.length < 2) continue;
    const [kind, id] = key.split(":");
    errors.push(
      `duplicate ${kind} id "${id}" defined in ${files.sort().join(" and ")} — ` +
        `ids are globally unique across domains`,
    );
  }
  return errors;
}

/**
 * Collect every referential violation in the graph. Empty array means clean.
 *
 * `domains` is the set of directory names actually present under `data/`, so a
 * claim's free-form `domain` string is validated against reality rather than a
 * hardcoded enum that would need editing every time a domain is added.
 */
export function integrityErrors(
  graph: ClaimGraph,
  refs: readonly SourceRef[],
  domains: readonly string[],
): string[] {
  const files = fileIndex(refs);
  const at = (kind: EntityKind, id: string) =>
    files.get(`${kind}:${id}`) ?? "<unknown file>";

  const claimIds = new Set(graph.claims.map((c) => c.id));
  const analysisIds = new Set(graph.analyses.map((a) => a.id));
  const knownDomains = new Set(domains);

  const errors: string[] = [...duplicateErrors(refs)];

  for (const edge of graph.edges) {
    for (const [end, id] of [
      ["fromId", edge.fromId],
      ["toId", edge.toId],
    ] as const) {
      if (!claimIds.has(id)) {
        errors.push(
          `${at("edge", edge.id)}: edge "${edge.id}" ${end} references unknown claim "${id}"`,
        );
      }
    }
  }

  for (const forecast of graph.forecasts) {
    if (!claimIds.has(forecast.attachedToClaimId)) {
      errors.push(
        `${at("forecast", forecast.id)}: forecast "${forecast.id}" is attached to ` +
          `unknown claim "${forecast.attachedToClaimId}"`,
      );
    }
  }

  for (const dossier of graph.dossiers) {
    if (!claimIds.has(dossier.attachedToClaimId)) {
      errors.push(
        `${at("dossier", dossierKey(dossier.attachedToClaimId))}: dossier is attached to ` +
          `unknown claim "${dossier.attachedToClaimId}"`,
      );
    }
  }

  const referencedAnalyses = new Set<string>();
  for (const claim of graph.claims) {
    for (const id of claim.analyses) {
      referencedAnalyses.add(id);
      if (!analysisIds.has(id)) {
        errors.push(
          `${at("claim", claim.id)}: claim "${claim.id}" references unknown analysis "${id}"`,
        );
      }
    }
    if (!knownDomains.has(claim.domain)) {
      errors.push(
        `${at("claim", claim.id)}: claim "${claim.id}" declares domain "${claim.domain}", ` +
          `which is not a directory under data/ (${[...knownDomains].sort().join(", ")})`,
      );
    }
  }

  for (const analysis of graph.analyses) {
    if (!referencedAnalyses.has(analysis.id)) {
      errors.push(
        `${at("analysis", analysis.id)}: analysis "${analysis.id}" is orphaned — ` +
          `no claim lists it in its analyses[]`,
      );
    }
    if (!knownDomains.has(analysis.domain)) {
      errors.push(
        `${at("analysis", analysis.id)}: analysis "${analysis.id}" declares domain ` +
          `"${analysis.domain}", which is not a directory under data/`,
      );
    }
  }

  return errors.sort();
}

/** Throw if the graph has any referential violation. Reports all of them at once. */
export function assertIntegrity(
  graph: ClaimGraph,
  refs: readonly SourceRef[],
  domains: readonly string[],
): void {
  const errors = integrityErrors(graph, refs, domains);
  if (errors.length === 0) return;

  const count = errors.length === 1 ? "1 problem" : `${errors.length} problems`;
  throw new Error(
    `Referential integrity check failed (${count}):\n` +
      errors.map((e) => `  - ${e}`).join("\n"),
  );
}
