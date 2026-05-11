/**
 * validate.ts
 *
 * Fetches an aboard JSON-LD response and validates it against the v0 schema.
 *
 *   npx tsx validate.ts                           # defaults to localhost:3000
 *   npx tsx validate.ts http://localhost:3000/api/graph
 *   npx tsx validate.ts http://localhost:3000/api/claims/M4
 *
 * Exit codes:
 *   0 — response validates
 *   1 — response is invalid, or fetch / schema load failed
 */
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { loadSchema } from "./schema-loader.ts";

type GraphResponse = {
  "aboard:claims"?: unknown[];
  "aboard:edges"?: unknown[];
  "aboard:forecasts"?: unknown[];
  "aboard:dossiers"?: unknown[];
  // Single-claim response shape:
  "schema:author"?: { "schema:dateCreated"?: string };
  "@type"?: string;
};

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
    console.error("INVALID");
    for (const err of validate.errors ?? []) {
      const path = err.instancePath || "(root)";
      console.error(`  ${path} — ${err.message ?? "validation error"}${
        err.params ? "  " + JSON.stringify(err.params) : ""
      }`);
    }
    process.exit(1);
  }

  // OK — produce a one-line summary tailored to which response shape this is.
  const data = body as GraphResponse;
  if (data["@type"] === "aboard:ClaimGraph") {
    const claims = data["aboard:claims"] ?? [];
    const edges = data["aboard:edges"] ?? [];
    const forecasts = data["aboard:forecasts"] ?? [];
    const dossiers = data["aboard:dossiers"] ?? [];
    const latestFiled = latestDate(claims);
    process.stdout.write(
      `OK — ${claims.length} claims, ${edges.length} edges, ${forecasts.length} forecasts, ${dossiers.length} dossiers, latest filed ${latestFiled}\n`
    );
  } else if (data["@type"] === "schema:Claim") {
    const incoming = (data as Record<string, unknown[]>)["aboard:incomingEdges"] ?? [];
    const outgoing = (data as Record<string, unknown[]>)["aboard:outgoingEdges"] ?? [];
    const forecasts = (data as Record<string, unknown[]>)["aboard:forecasts"] ?? [];
    const hasDossier =
      (data as Record<string, unknown>)["aboard:dossier"] !== undefined;
    process.stdout.write(
      `OK — single claim, ${incoming.length} incoming, ${outgoing.length} outgoing, ${forecasts.length} forecast(s), ${
        hasDossier ? "1 dossier" : "no dossier"
      }\n`
    );
  } else {
    process.stdout.write("OK — response validated (unknown @type, no summary)\n");
  }
  process.exit(0);
}

function latestDate(claims: unknown[]): string {
  let latest = "";
  for (const c of claims) {
    const author = (c as Record<string, unknown>)["schema:author"];
    if (!author || typeof author !== "object") continue;
    const date = (author as Record<string, unknown>)["schema:dateCreated"];
    if (typeof date === "string" && date > latest) latest = date;
  }
  if (!latest) return "—";
  // Strip time portion; latest filed is more readable as YYYY-MM-DD.
  const m = latest.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : latest;
}

main().catch((err) => {
  console.error(`Unexpected error: ${(err as Error).message}`);
  process.exit(1);
});
