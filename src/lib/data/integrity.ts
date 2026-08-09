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
 * Decompose `data/<domain>/<subdir>/<basename>.<ext>`.
 *
 * Null for anything that does not sit one entity to a file under a domain
 * directory: `data/cross_domain_edges.yaml` and `data/<domain>/edges.yaml` both
 * hold many edges, so neither a filename nor a directory says anything about an
 * individual edge's identity.
 */
function locate(file: string): { domain: string; basename: string } | null {
  const parts = file.split("/");
  if (parts.length < 4 || parts[0] !== "data") return null;
  const last = parts[parts.length - 1];
  const dot = last.lastIndexOf(".");
  return { domain: parts[1], basename: dot === -1 ? last : last.slice(0, dot) };
}

/** File types that are one entity per file, so the filename is a claim about identity. */
const ONE_PER_FILE: readonly EntityKind[] = ["claim", "forecast", "dossier", "analysis"];

/**
 * Reconcile what a file *says* with where it *is*.
 *
 * The Zod schemas read frontmatter and the loader reads directories, and until
 * this ran nothing compared the two. A claim in `data/inequality/` declaring
 * `domain: democratic_backsliding`, or an `S2.md` whose frontmatter says
 * `id: S3`, passed every check the project had.
 *
 * That is not cosmetic, because the write path derives paths rather than
 * looking them up: the Worker builds a forecast's path from the domain of the
 * claim it attaches to. Once a file's location and its content disagree, every
 * later proposal against it addresses a path that does not exist and comes back
 * as an opaque `github_failed`. Catching it here makes it a named build error
 * on the commit that introduces it.
 */
function locationErrors(
  graph: ClaimGraph,
  refs: readonly SourceRef[],
  domains: readonly string[],
): string[] {
  const errors: string[] = [];
  const files = fileIndex(refs);
  const at = (kind: EntityKind, id: string) => files.get(`${kind}:${id}`) ?? "<unknown file>";
  const knownDomains = new Set(domains);

  /**
   * Ids defined in more than one file. `fileIndex` keeps the first, so for a
   * duplicated id no single file is "the" file and a location check would
   * report an arbitrary one. The duplicate error already names both.
   */
  const duplicated = new Set<string>();
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) duplicated.add(key);
    seen.add(key);
  }

  for (const ref of refs) {
    if (!ONE_PER_FILE.includes(ref.kind)) continue;
    if (duplicated.has(`${ref.kind}:${ref.id}`)) continue;
    const loc = locate(ref.file);
    if (!loc) continue;
    if (loc.basename !== ref.id) {
      const what = ref.kind === "dossier" ? "attaches to claim" : "declares id";
      errors.push(
        `${ref.file}: ${ref.kind} ${what} "${ref.id}" but its filename says ` +
          `"${loc.basename}" — the filename and the content must agree`,
      );
    }
  }

  // The two entity types that carry a `domain` of their own.
  for (const [kind, entities] of [
    ["claim", graph.claims],
    ["analysis", graph.analyses],
  ] as const) {
    for (const entity of entities) {
      if (duplicated.has(`${kind}:${entity.id}`)) continue;
      // A domain that is not a directory at all is reported by the
      // known-domain check below; reporting the mismatch too would name one
      // mistake twice, and less usefully.
      if (!knownDomains.has(entity.domain)) continue;
      const loc = locate(at(kind, entity.id));
      if (loc && loc.domain !== entity.domain) {
        errors.push(
          `${at(kind, entity.id)}: ${kind} "${entity.id}" declares domain ` +
            `"${entity.domain}" but sits in data/${loc.domain}/`,
        );
      }
    }
  }

  // Forecasts and dossiers carry no domain, so theirs is the directory they sit
  // in — which has to be the directory of the claim they attach to, because
  // that is the path the Worker will derive when it next writes to them.
  const claimDir = new Map<string, string>();
  for (const ref of refs) {
    if (ref.kind !== "claim") continue;
    const loc = locate(ref.file);
    if (loc) claimDir.set(ref.id, loc.domain);
  }

  const attached: readonly (readonly [EntityKind, string, string])[] = [
    ...graph.forecasts.map((f) => ["forecast", f.id, f.attachedToClaimId] as const),
    ...graph.dossiers.map((d) => ["dossier", d.attachedToClaimId, d.attachedToClaimId] as const),
  ];

  for (const [kind, id, claimId] of attached) {
    const loc = locate(at(kind, id));
    const expected = claimDir.get(claimId);
    // An absent claim is already reported as a dangling attachment; do not
    // report the same file twice for one underlying mistake.
    if (loc && expected && loc.domain !== expected) {
      errors.push(
        `${at(kind, id)}: ${kind} attaches to claim "${claimId}" in data/${expected}/ ` +
          `but sits in data/${loc.domain}/ — the write path derives its path from the claim`,
      );
    }
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

  const errors: string[] = [
    ...duplicateErrors(refs),
    ...locationErrors(graph, refs, domains),
  ];

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

  const forecastIds = new Set(graph.forecasts.map((f) => f.id));

  for (const forecast of graph.forecasts) {
    if (!claimIds.has(forecast.attachedToClaimId)) {
      errors.push(
        `${at("forecast", forecast.id)}: forecast "${forecast.id}" is attached to ` +
          `unknown claim "${forecast.attachedToClaimId}"`,
      );
    }
    for (const id of forecast.supersededBy ?? []) {
      if (id === forecast.id) {
        errors.push(
          `${at("forecast", forecast.id)}: forecast "${forecast.id}" names itself in supersededBy`,
        );
      } else if (!forecastIds.has(id)) {
        errors.push(
          `${at("forecast", forecast.id)}: forecast "${forecast.id}" supersededBy references ` +
            `unknown forecast "${id}"`,
        );
      }
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
