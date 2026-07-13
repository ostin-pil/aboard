import "server-only";
import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join, relative } from "path";
import matter from "gray-matter";
import YAML from "yaml";
import {
  Claim,
  Edge,
  Forecast,
  Dossier,
  Analysis,
  type ClaimGraph,
} from "@/lib/types";
import { assertIntegrity, type SourceRef } from "@/lib/data/integrity";

const DATA_ROOT = join(process.cwd(), "data");

/** Repo-relative path, so thrown errors name the file a contributor has to open. */
const rel = (p: string) => relative(process.cwd(), p);

function readDirIfExists(p: string): string[] {
  if (!existsSync(p)) return [];
  if (!statSync(p).isDirectory()) return [];
  return readdirSync(p);
}

function readFileOptional(p: string): string | null {
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8");
}

function loadClaim(filePath: string): Claim {
  const raw = readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  const parsed = {
    ...data,
    statement: content.trim(),
  };
  return Claim.parse(parsed);
}

function loadYaml<T>(filePath: string, schema: { parse: (x: unknown) => T }): T {
  const raw = readFileSync(filePath, "utf8");
  return schema.parse(YAML.parse(raw));
}

function loadEdges(filePath: string): Edge[] {
  const raw = readFileOptional(filePath);
  if (!raw) return [];
  const list = YAML.parse(raw);
  // An absent edges file is legitimate; a present one that is not a list is a
  // malformed file, and silently yielding no edges would hide it.
  if (list === null || list === undefined) return [];
  if (!Array.isArray(list)) {
    throw new Error(
      `${rel(filePath)}: expected a YAML list of edges, got ${typeof list}`,
    );
  }
  return list.map((e) => Edge.parse(e));
}

type DomainData = {
  claims: Claim[];
  edges: Edge[];
  forecasts: Forecast[];
  dossiers: Dossier[];
  analyses: Analysis[];
  refs: SourceRef[];
};

function yamlFiles(dir: string): string[] {
  return readDirIfExists(dir).filter(
    (f) => f.endsWith(".yaml") || f.endsWith(".yml"),
  );
}

function loadDomain(domain: string): DomainData {
  const dir = join(DATA_ROOT, domain);
  const refs: SourceRef[] = [];

  const claims = readDirIfExists(join(dir, "claims"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const file = join(dir, "claims", f);
      const claim = loadClaim(file);
      refs.push({ kind: "claim", id: claim.id, file: rel(file) });
      return claim;
    });

  const edgesFile = join(dir, "edges.yaml");
  const edges = loadEdges(edgesFile);
  for (const edge of edges) {
    refs.push({ kind: "edge", id: edge.id, file: rel(edgesFile) });
  }

  const forecasts = yamlFiles(join(dir, "forecasts")).map((f) => {
    const file = join(dir, "forecasts", f);
    const forecast = loadYaml(file, Forecast);
    refs.push({ kind: "forecast", id: forecast.id, file: rel(file) });
    return forecast;
  });

  const dossiers = yamlFiles(join(dir, "dossiers")).map((f) => {
    const file = join(dir, "dossiers", f);
    const dossier = loadYaml(file, Dossier);
    refs.push({
      kind: "dossier",
      id: dossier.attachedToClaimId,
      file: rel(file),
    });
    return dossier;
  });

  const analyses = yamlFiles(join(dir, "analyses")).map((f) => {
    const file = join(dir, "analyses", f);
    const analysis = loadYaml(file, Analysis);
    refs.push({ kind: "analysis", id: analysis.id, file: rel(file) });
    return analysis;
  });

  return { claims, edges, forecasts, dossiers, analyses, refs };
}

function listDomains(): string[] {
  if (!existsSync(DATA_ROOT)) return [];
  return readdirSync(DATA_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function loadAll(): ClaimGraph {
  const claims: Claim[] = [];
  const edges: Edge[] = [];
  const forecasts: Forecast[] = [];
  const dossiers: Dossier[] = [];
  const analyses: Analysis[] = [];
  const refs: SourceRef[] = [];

  const domains = listDomains();

  for (const domain of domains) {
    const d = loadDomain(domain);
    claims.push(...d.claims);
    edges.push(...d.edges);
    forecasts.push(...d.forecasts);
    dossiers.push(...d.dossiers);
    analyses.push(...d.analyses);
    refs.push(...d.refs);
  }

  // cross-domain edges
  const crossPath = join(DATA_ROOT, "cross_domain_edges.yaml");
  const crossEdges = loadEdges(crossPath);
  edges.push(...crossEdges);
  for (const edge of crossEdges) {
    refs.push({ kind: "edge", id: edge.id, file: rel(crossPath) });
  }

  const graph: ClaimGraph = { claims, edges, forecasts, dossiers, analyses };
  assertIntegrity(graph, refs, domains);
  return graph;
}

let cached: ClaimGraph | null = null;

export function getGraph(): ClaimGraph {
  if (cached) return cached;
  cached = loadAll();
  return cached;
}

// useful for the migration script + tests; resets the module-level cache
export function _resetGraphCache() {
  cached = null;
}
