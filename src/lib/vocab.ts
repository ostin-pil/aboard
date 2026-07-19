/**
 * The published vocabulary: the IRIs aboard mints into every representation of
 * a claim, server-rendered or client-exported.
 *
 * These are **stable literals, not derived from `siteBaseUrl()`**, and that is
 * deliberate. A vocabulary IRI is a public identifier embedded in everything we
 * publish and cached by any consumer that resolves the context; a preview
 * deploy or a localhost build must not mint a different vocabulary. Display
 * URLs (which *should* follow the deploy) come from `site.ts` instead.
 *
 * This module is the single source for them. It imports nothing — in
 * particular nothing server-only and no environment access — so the client
 * bundle can share it and the two published dialects cannot drift apart.
 */

export const VOCAB_ORIGIN = "https://aboard.untype.me";

/** JSON-LD context shared by the API serializers and the client export. */
export const JSONLD_CONTEXT = {
  schema: "https://schema.org/",
  aboard: `${VOCAB_ORIGIN}/vocab/`,
} as const;

/** The published JSON Schema that `/api/*` output validates against. */
export const SCHEMA_URL = `${VOCAB_ORIGIN}/schema/v0.json`;

/** Schema/graph version marker carried by published documents. */
export const GRAPH_VERSION = "v0";
