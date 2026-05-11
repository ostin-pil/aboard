/**
 * Loads the v0 JSON Schema. Tries the local file first (relative to the
 * adapter), then falls back to fetching it from the running app at
 * `{base}/schema/v0.json`. Two paths because the adapter is run both from
 * inside the repo (where the file is on disk) and against deployed instances
 * (where only HTTP is available).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export type SchemaDocument = Record<string, unknown>;

export async function loadSchema(apiUrl: string): Promise<SchemaDocument> {
  const here = dirname(fileURLToPath(import.meta.url));
  const localPath = resolve(here, "..", "public", "schema", "v0.json");
  try {
    const raw = readFileSync(localPath, "utf8");
    return JSON.parse(raw) as SchemaDocument;
  } catch {
    // Fall through to HTTP.
  }
  const origin = new URL(apiUrl).origin;
  const res = await fetch(`${origin}/schema/v0.json`);
  if (!res.ok) {
    throw new Error(
      `Could not load schema from local file (${localPath}) or from ${origin}/schema/v0.json (HTTP ${res.status}).`
    );
  }
  return (await res.json()) as SchemaDocument;
}
