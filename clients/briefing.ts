/**
 * briefing.ts
 *
 * Fetches the aboard JSON-LD graph response, validates it against the v0
 * schema, and renders a human-readable Markdown briefing on stdout. The
 * briefing covers all symptoms, mechanisms, leverage points, every forecast
 * and prediction, and every dossier with its top-ranked crux.
 *
 *   npx tsx briefing.ts                                    # localhost:3000
 *   npx tsx briefing.ts http://localhost:3000/api/graph
 *   npx tsx briefing.ts > briefing.md
 *
 * The point: prove the agent-readable JSON-LD round-trips back into a
 * well-formed human briefing without bespoke scraping.
 */
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { loadSchema } from "./schema-loader.ts";

// --- Shape of the response we read (typed loosely; AJV does the real work) ---

type IriRef = { "@id": string };

type Source = {
  "@type": "schema:CreativeWork";
  "schema:name": string;
  "schema:url": string;
  "schema:abstract"?: string;
};

type Author = {
  "@type": "schema:SoftwareApplication";
  "schema:name": string;
  "schema:dateCreated"?: string;
  "aboard:promptTitle"?: string;
};

type Claim = {
  "@type": "schema:Claim";
  "@id": string;
  "schema:name": string;
  "schema:text": string;
  "aboard:kind": "symptom" | "mechanism" | "leverage_point";
  "aboard:domain": string;
  "aboard:confidence": number;
  "schema:citation": Source[];
  "schema:author": Author;
};

type Edge = {
  "@type": "aboard:CausalEdge";
  "@id": string;
  "aboard:from": IriRef;
  "aboard:to": IriRef;
  "aboard:relation": "causes" | "moderates" | "reduces" | "evidences";
  "aboard:strength": number;
  "aboard:rationale"?: string;
};

type Prediction = {
  "@type": "aboard:Prediction";
  "aboard:probability": number;
  "aboard:reasoning": string;
  "schema:author": Author;
};

type Forecast = {
  "@type": "aboard:Forecast";
  "@id": string;
  "aboard:attachedTo": IriRef;
  "schema:name": string;
  "aboard:resolutionDate": string;
  "aboard:resolutionCriteria": string;
  "aboard:predictions": Prediction[];
};

type Argument = {
  "@type": "aboard:Argument";
  "aboard:thesis": string;
  "schema:text": string;
  "schema:citation": Source[];
  "schema:author": Author;
};

type Crux = {
  "@type": "aboard:Crux";
  "schema:text": string;
  "aboard:impactScore": number;
  "aboard:uncertainty": number;
};

type Dossier = {
  "@type": "aboard:Dossier";
  "@id": string;
  "aboard:attachedTo": IriRef;
  "aboard:pro": Argument;
  "aboard:con": Argument;
  "aboard:cruxes": Crux[];
};

type ClaimGraphResponse = {
  "@type": "aboard:ClaimGraph";
  "@id": string;
  "aboard:domains": string[];
  "aboard:claims": Claim[];
  "aboard:edges": Edge[];
  "aboard:forecasts": Forecast[];
  "aboard:dossiers": Dossier[];
};

// --- helpers ---

function shortId(iri: string): string {
  const segments = iri.split("/");
  return segments[segments.length - 1] || iri;
}

function pad(n: number, width = 2): string {
  return n.toString().padStart(width, "0");
}

function pct(p: number): string {
  return `${(p * 100).toFixed(0)}%`;
}

function findClaim(graph: ClaimGraphResponse, iri: string): Claim | undefined {
  return graph["aboard:claims"].find((c) => c["@id"] === iri);
}

// --- briefing renderer ---

function renderBriefing(graph: ClaimGraphResponse): string {
  const out: string[] = [];
  const domains = graph["aboard:domains"] ?? [];
  const domainTitle = domains.length === 0 ? "(no domain)" : domains.join(", ");
  const claims = graph["aboard:claims"];
  const edges = graph["aboard:edges"];
  const forecasts = graph["aboard:forecasts"];
  const dossiers = graph["aboard:dossiers"];

  const symptoms = claims.filter((c) => c["aboard:kind"] === "symptom");
  const mechanisms = claims.filter((c) => c["aboard:kind"] === "mechanism");
  const leverage = claims.filter((c) => c["aboard:kind"] === "leverage_point");

  const forecastsByClaim = new Map<string, Forecast[]>();
  for (const f of forecasts) {
    const target = f["aboard:attachedTo"]["@id"];
    const arr = forecastsByClaim.get(target) ?? [];
    arr.push(f);
    forecastsByClaim.set(target, arr);
  }
  const dossierByClaim = new Map<string, Dossier>();
  for (const d of dossiers) {
    dossierByClaim.set(d["aboard:attachedTo"]["@id"], d);
  }

  // --- header ---
  out.push(`# aboard briefing — ${domainTitle}`);
  out.push("");
  out.push(`Generated from \`${graph["@id"]}\` against the v0 JSON-LD schema.`);
  out.push("");
  out.push(
    `**Counts:** ${claims.length} claim${claims.length === 1 ? "" : "s"} ` +
      `(${symptoms.length} symptom${symptoms.length === 1 ? "" : "s"}, ` +
      `${mechanisms.length} mechanism${mechanisms.length === 1 ? "" : "s"}, ` +
      `${leverage.length} leverage point${leverage.length === 1 ? "" : "s"}) · ` +
      `${edges.length} edge${edges.length === 1 ? "" : "s"} · ` +
      `${forecasts.length} forecast${forecasts.length === 1 ? "" : "s"} · ` +
      `${dossiers.length} dossier${dossiers.length === 1 ? "" : "s"} · ` +
      `${domains.length} domain${domains.length === 1 ? "" : "s"}.`
  );
  out.push("");

  // --- per-domain sections ---
  for (const domain of domains) {
    const domainClaims = claims.filter((c) => c["aboard:domain"] === domain);
    const dSymptoms = domainClaims.filter((c) => c["aboard:kind"] === "symptom");
    const dMechanisms = domainClaims.filter((c) => c["aboard:kind"] === "mechanism");
    const dLeverage = domainClaims.filter((c) => c["aboard:kind"] === "leverage_point");

    out.push(`## Domain: ${domain}`);
    out.push("");
    out.push(
      `${domainClaims.length} claim${domainClaims.length === 1 ? "" : "s"} ` +
        `(${dSymptoms.length}/${dMechanisms.length}/${dLeverage.length} symptom/mechanism/leverage).`
    );
    out.push("");

    if (dSymptoms.length > 0) {
      out.push("### Symptoms");
      out.push("");
      for (const c of dSymptoms) {
        const id = shortId(c["@id"]);
        const sources = c["schema:citation"].length;
        out.push(
          `- **${id}** · ${c["schema:name"]} — confidence ${c["aboard:confidence"].toFixed(2)} · ${sources} source${sources === 1 ? "" : "s"}`
        );
      }
      out.push("");
    }

    if (dMechanisms.length > 0) {
      out.push("### Mechanisms");
      out.push("");
      for (const c of dMechanisms) {
        const id = shortId(c["@id"]);
        const fcCount = forecastsByClaim.get(c["@id"])?.length ?? 0;
        const hasDossier = dossierByClaim.has(c["@id"]);
        const flags: string[] = [];
        if (fcCount > 0) flags.push(`${fcCount} forecast${fcCount === 1 ? "" : "s"}`);
        if (hasDossier) flags.push("dossier");
        const flagStr = flags.length ? ` — ${flags.join(", ")}` : "";
        out.push(
          `- **${id}** · ${c["schema:name"]} — confidence ${c["aboard:confidence"].toFixed(2)}${flagStr}`
        );
      }
      out.push("");
    }

    if (dLeverage.length > 0) {
      out.push("### Leverage points");
      out.push("");
      for (const c of dLeverage) {
        const id = shortId(c["@id"]);
        out.push(
          `- **${id}** · ${c["schema:name"]} — confidence ${c["aboard:confidence"].toFixed(2)}`
        );
      }
      out.push("");
    }
  }

  // --- cross-domain edges ---
  const claimDomain = new Map<string, string>();
  for (const c of claims) claimDomain.set(c["@id"], c["aboard:domain"]);
  const crossEdges = edges.filter((e) => {
    const fd = claimDomain.get(e["aboard:from"]["@id"]);
    const td = claimDomain.get(e["aboard:to"]["@id"]);
    return fd && td && fd !== td;
  });
  if (crossEdges.length > 0) {
    out.push("## Cross-domain edges");
    out.push("");
    for (const e of crossEdges) {
      const fromId = shortId(e["aboard:from"]["@id"]);
      const toId = shortId(e["aboard:to"]["@id"]);
      const fd = claimDomain.get(e["aboard:from"]["@id"]) ?? "?";
      const td = claimDomain.get(e["aboard:to"]["@id"]) ?? "?";
      const id = shortId(e["@id"]);
      const rationale = e["aboard:rationale"] ? ` — ${e["aboard:rationale"]}` : "";
      out.push(
        `- **${id}** · ${fromId} (${fd}) ${e["aboard:relation"]} → ${toId} (${td}) · strength ${e["aboard:strength"].toFixed(2)}${rationale}`
      );
    }
    out.push("");
  }

  // --- forecasts ---
  if (forecasts.length > 0) {
    out.push("## Forecasts");
    out.push("");
    for (const f of forecasts) {
      const id = shortId(f["@id"]);
      const targetClaim = findClaim(graph, f["aboard:attachedTo"]["@id"]);
      const targetLabel = targetClaim
        ? `${shortId(targetClaim["@id"])} (${targetClaim["schema:name"]})`
        : f["aboard:attachedTo"]["@id"];
      out.push(`### ${id} · attached to ${targetLabel}`);
      out.push("");
      out.push(`**Question:** ${f["schema:name"]}`);
      out.push("");
      out.push(`**Resolves:** ${f["aboard:resolutionDate"]}`);
      out.push("");
      out.push(`**Criteria:** ${f["aboard:resolutionCriteria"]}`);
      out.push("");
      for (const p of f["aboard:predictions"]) {
        const oneLine = p["aboard:reasoning"].replace(/\s+/g, " ").trim();
        out.push(
          `- **P = ${p["aboard:probability"].toFixed(2)}** (${pct(p["aboard:probability"])}) — *${p["schema:author"]["schema:name"]}* — ${oneLine}`
        );
      }
      out.push("");
    }
  }

  // --- dossiers ---
  if (dossiers.length > 0) {
    out.push("## Dossiers");
    out.push("");
    for (const d of dossiers) {
      const targetClaim = findClaim(graph, d["aboard:attachedTo"]["@id"]);
      const id = targetClaim ? shortId(targetClaim["@id"]) : shortId(d["@id"]);
      const title = targetClaim?.["schema:name"] ?? "(unknown contested claim)";
      out.push(`### ${id} · ${title}`);
      out.push("");
      out.push(`**Pro thesis:** ${d["aboard:pro"]["aboard:thesis"]}`);
      out.push("");
      out.push(`**Con thesis:** ${d["aboard:con"]["aboard:thesis"]}`);
      out.push("");
      const ranked = [...d["aboard:cruxes"]].sort(
        (a, b) =>
          b["aboard:impactScore"] * b["aboard:uncertainty"] -
          a["aboard:impactScore"] * a["aboard:uncertainty"]
      );
      if (ranked.length > 0) {
        const top = ranked[0];
        const score = top["aboard:impactScore"] * top["aboard:uncertainty"];
        out.push(
          `**Top crux** (impact ${top["aboard:impactScore"].toFixed(2)} × uncertainty ${top["aboard:uncertainty"].toFixed(2)} = rank ${score.toFixed(2)}): ${top["schema:text"]}`
        );
        out.push("");
      }
      const remaining = ranked.length - 1;
      if (remaining > 0) {
        out.push(`*${remaining} additional crux${remaining === 1 ? "" : "es"} omitted.*`);
        out.push("");
      }
    }
  }

  // --- footer ---
  const ts = new Date();
  const tsStr = `${ts.getUTCFullYear()}-${pad(ts.getUTCMonth() + 1)}-${pad(ts.getUTCDate())}T${pad(ts.getUTCHours())}:${pad(ts.getUTCMinutes())}Z`;
  out.push("---");
  out.push("");
  out.push(`*Briefing generated ${tsStr} by clients/briefing.ts. Source: ${graph["@id"]}.*`);
  out.push("");
  return out.join("\n");
}

// --- main ---

async function main() {
  const url = process.argv[2] ?? "http://localhost:3000/api/graph";

  let schema: Record<string, unknown>;
  try {
    schema = await loadSchema(url);
  } catch (err) {
    console.error(`Failed to load schema: ${(err as Error).message}`);
    process.exit(1);
  }

  let body: unknown;
  try {
    const res = await fetch(url, { headers: { Accept: "application/ld+json" } });
    if (!res.ok) {
      console.error(`Fetch failed — HTTP ${res.status} from ${url}`);
      process.exit(1);
    }
    body = await res.json();
  } catch (err) {
    console.error(`Fetch failed — ${(err as Error).message}`);
    process.exit(1);
  }

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats.default(ajv);
  const validate = ajv.compile(schema);
  const ok = validate(body);
  if (!ok) {
    console.error("INVALID — cannot render briefing for non-validating response.");
    for (const err of validate.errors ?? []) {
      console.error(`  ${err.instancePath || "(root)"} — ${err.message ?? "error"}`);
    }
    process.exit(1);
  }

  const data = body as { "@type"?: string };
  if (data["@type"] !== "aboard:ClaimGraph") {
    console.error(
      `briefing.ts expects a ClaimGraph response, got @type=${data["@type"]}. Use validate.ts for single-claim responses.`
    );
    process.exit(1);
  }

  const graph = body as ClaimGraphResponse;
  const md = renderBriefing(graph);
  process.stdout.write(md);
  process.exit(0);
}

main().catch((err) => {
  console.error(`Unexpected error: ${(err as Error).message}`);
  process.exit(1);
});
