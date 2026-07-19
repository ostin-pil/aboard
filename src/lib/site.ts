/**
 * Canonical site base URL used to build absolute JSON-LD `@id`s.
 *
 * Under static export there is no request to derive an origin from, so the base
 * is fixed at build time: it defaults to the canonical domain, and `SITE_URL`
 * overrides it (a preview deploy, or a local build served from localhost).
 *
 * The default is absolute rather than empty on purpose. `public/schema/v0.json`
 * requires `"format": "uri"` on every `@id`, so the old empty-string fallback
 * emitted relative IRIs and produced JSON-LD that failed our own published
 * schema. An unset `SITE_URL` is a normal local build, not a licence to publish
 * output that violates the spec.
 */
export const CANONICAL_ORIGIN = "https://aboard.untype.me";

export function siteBaseUrl(): string {
  const configured = (process.env.SITE_URL ?? "").trim();
  return (configured || CANONICAL_ORIGIN).replace(/\/+$/, "");
}

/**
 * Bare host for display (no scheme, no trailing slash) — the URL label printed
 * on OG cards. Derived from the same base as everything else so a card can
 * never advertise a domain the build does not serve.
 */
export function siteHost(): string {
  return siteBaseUrl().replace(/^https?:\/\//, "");
}
