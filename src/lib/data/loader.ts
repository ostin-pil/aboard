import "server-only";
import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join } from "path";
import matter from "gray-matter";
import YAML from "yaml";
import {
  Claim,
  Edge,
  Forecast,
  Dossier,
  type ClaimGraph,
} from "@/lib/types";

const DATA_ROOT = join(process.cwd(), "data");

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
  if (!Array.isArray(list)) return [];
  return list.map((e) => Edge.parse(e));
}

function loadDomain(domain: string): {
  claims: Claim[];
  edges: Edge[];
  forecasts: Forecast[];
  dossiers: Dossier[];
} {
  const dir = join(DATA_ROOT, domain);

  const claims = readDirIfExists(join(dir, "claims"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => loadClaim(join(dir, "claims", f)));

  const edges = loadEdges(join(dir, "edges.yaml"));

  const forecasts = readDirIfExists(join(dir, "forecasts"))
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => loadYaml(join(dir, "forecasts", f), Forecast));

  const dossiers = readDirIfExists(join(dir, "dossiers"))
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => loadYaml(join(dir, "dossiers", f), Dossier));

  return { claims, edges, forecasts, dossiers };
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

  for (const domain of listDomains()) {
    const d = loadDomain(domain);
    claims.push(...d.claims);
    edges.push(...d.edges);
    forecasts.push(...d.forecasts);
    dossiers.push(...d.dossiers);
  }

  // cross-domain edges
  const crossPath = join(DATA_ROOT, "cross_domain_edges.yaml");
  edges.push(...loadEdges(crossPath));

  return { claims, edges, forecasts, dossiers };
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
