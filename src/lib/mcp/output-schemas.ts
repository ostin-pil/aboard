/**
 * Output schemas for the read tools, derived from the published JSON Schema.
 *
 * ## Why derived rather than written
 *
 * Three read tools hand back a document the API already serves, and
 * `public/schema/v0.json` is already the authoritative description of those
 * documents: `ClaimGraphResponse` for `GET /api/graph`, `FullClaimResponse` for
 * `GET /api/claims/{id}`, and `Dossier` for the sub-object `get_dossier`
 * projects out. Restating any of them here would be a second description of one
 * contract, free to drift, which is the duplication the input schemas are
 * derived from Zod to avoid.
 *
 * It also keeps the promise cheap to keep. The spec is strict about this: a
 * tool that declares an output schema **MUST** return structured results that
 * conform to it. We are only able to make that promise because the project
 * already holds the API to `v0.json` (see `CLAUDE.md`: the schema is the spec,
 * and changing the serializer means changing it in the same commit). Declaring
 * it here propagates a guarantee that already exists rather than inventing one
 * this layer would have to maintain alone.
 *
 * ## Self-contained, not a remote reference
 *
 * Each schema carries the transitive closure of the `$defs` it needs, so a
 * client can validate offline. A bare `$ref` to the schema's own published
 * `$id` would be smaller and is genuinely resolvable, but most validators will
 * not fetch a remote reference, so it would describe nothing to most of the
 * clients that asked.
 *
 * The cost is real and worth naming: the closures add roughly 28KB to
 * `tools/list`, which a client fetches once per connection.
 */
import v0 from "../../../public/schema/v0.json";

/** A JSON Schema document, as handed to an MCP client. */
type JsonSchema = Record<string, unknown>;

const SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";

const DEFS = (v0 as unknown as { $defs: Record<string, JsonSchema> }).$defs;

/** Every `#/$defs/X` named anywhere inside a schema node. */
function localRefs(node: unknown, found: Set<string>): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) localRefs(item, found);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "$ref" && typeof value === "string" && value.startsWith("#/$defs/")) {
      found.add(value.slice("#/$defs/".length));
    } else {
      localRefs(value, found);
    }
  }
}

/**
 * The named definitions plus everything they reach, so the result resolves
 * against itself with no dangling `$ref`.
 */
function closureOf(names: readonly string[]): Record<string, JsonSchema> {
  const reached = new Set<string>();
  const pending = [...names];
  while (pending.length > 0) {
    const name = pending.pop();
    if (name === undefined || reached.has(name)) continue;
    const def = DEFS[name];
    if (def === undefined) throw new Error(`v0.json has no $defs.${name}`);
    reached.add(name);
    const nested = new Set<string>();
    localRefs(def, nested);
    for (const ref of nested) if (!reached.has(ref)) pending.push(ref);
  }
  return Object.fromEntries([...reached].sort().map((name) => [name, DEFS[name]]));
}

/**
 * A published document's schema, lifted out of `v0.json` and made standalone.
 *
 * The definition's own keywords sit at the root so the schema describes the
 * document directly, and the closure rides underneath at `$defs` so the
 * definition's internal `#/$defs/...` pointers still resolve.
 */
export function publishedDocumentSchema(defName: string): JsonSchema {
  const def = DEFS[defName];
  if (def === undefined) throw new Error(`v0.json has no $defs.${defName}`);
  return { $schema: SCHEMA_DIALECT, ...def, $defs: closureOf([defName]) };
}

/**
 * A schema this layer owns, for a tool that returns an envelope of its own
 * rather than a published document, carrying whatever `v0.json` definitions the
 * envelope embeds.
 *
 * The dialect is left to the caller when nothing is embedded, because a schema
 * rendered from Zod already declares the draft it was rendered as (draft-07,
 * per `schemaOf`) and overwriting that would misdescribe it. Embedding is the
 * one case that forces the question: `v0.json`'s definitions are 2020-12, so a
 * document carrying them is 2020-12, and the envelope around them must say so
 * rather than inherit a draft-07 label from its other half.
 */
export function envelopeSchema(schema: JsonSchema, embeds: readonly string[] = []): JsonSchema {
  if (embeds.length === 0) return schema;
  return { $schema: SCHEMA_DIALECT, ...schema, $defs: closureOf(embeds) };
}
